import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	TextComponent,
	PluginSettingTab,
	Setting,
	RequestParam,
	request
} from 'obsidian';

// import parser from 'xml2json';

// Remember to rename these classes and interfaces!

interface arXivSummary {
	id: string;
	updated: string;
	published: string;
	title: string;
	authors: [string];
	summary: string;
	// url: string;
}

interface arXivSettings {
	template: string;
}

const DEFAULT_SETTINGS: arXivSettings = {
	template: `{{title}}\n{{authors}}\n{{summary}}`,
}

export default class arXivPlugin extends Plugin {
	settings: arXivSettings;

	getUrl(): string {
		return `https://export.arxiv.org/api/query?id_list=`;
	}

	async getArXivPaperByID(editor: Editor) {
		new ArXiVIDModal(this.app, this, editor).open();
	}

	handleNotFound(paperID: string) {
		new Notice(`${paperID} not found on arXiv.`);
	}

	handleCouldntResolveDisambiguation() {
		new Notice(`Could not automatically resolve disambiguation.`);
	}

	formatExtractInsert(summary: arXivSummary): string {
		const template = this.settings.template;
		const formattedTemplate = template
		  .replace("{{title}}", summary.title)
		  .replace("{{id}}", summary.id)
		  .replace("{{summary}}", summary.summary)
		//   .replace("{{authors}}", summary.authors.join(', '))
		  .replace("{{updated}}", summary.updated)
		  .replace("{{published}}", summary.published);
		return formattedTemplate;
	}

	async createPage(editor: Editor, paperID: string) {
		let extract: arXivSummary = await this.getPaperDetails(paperID);
		if (extract.title == `Error`) {
			this.handleNotFound(paperID);
			return;
		}
		editor.replaceSelection(this.formatExtractInsert(extract));
	}

	parseResponse(json: any): arXivSummary {
		console.log(json);
		const entries = json['feed']['entry'];
		console.log(entries);
		const papers: arXivSummary[] = entries.map((entry) => {
			const authors = entry['authors'].map((author) => {author['name']})
			const paper: arXivSummary = {
				id: entry['id'],
				updated: entry['updated'],
				published: entry['published'],
				title: entry['title'],
				authors: authors,
				summary: entry['summary'],
			};
			return paper;
		});
		return papers[0];
	}

	async getPaperDetails(paperID: string): Promise<arXivSummary> {
		const url = this.getUrl() + encodeURIComponent(paperID);
		const requestParam: RequestParam = {
			url: url,
		};
		const parser = new DOMParser();
		const resp = await request(requestParam)
		// .then((r) => console.log(r))
		.then((r) => parser.parseFromString(r, "text/xml"))
		.then((r) => console.log(r))
		.catch(
			() =>
			new Notice(
				"Failed to get arXiv. Check your internet connection or language prefix."
				)
		);
		const extract = this.parseResponse(resp);
		return extract;
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "arxiv-get-by-id",
			name: "Get arXiv paper by ID",
			editorCallback: (editor: Editor) =>
			this.getArXivPaperByID(editor),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new arXivSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ArXiVIDModal extends Modal {
	paperID: string;
	plugin: arXivPlugin;
	editor: Editor;

	constructor(app: App, plugin: arXivPlugin, editor: Editor) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
	}

	onOpen() {
		let { contentEl } = this;

		contentEl.createEl("h2", { text: "Enter Paper ID:" });

		const inputs = contentEl.createDiv("inputs");
		const searchInput = new TextComponent(inputs).onChange((paperID) => {
			this.paperID = paperID;
		});
		searchInput.inputEl.focus();
		searchInput.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				this.close();
			}
		});

		const controls = contentEl.createDiv("controls");
		const searchButton = controls.createEl("button", {
			text: "Search",
			cls: "mod-cta",
			attr: {
				autofocus: true,
			},
		});
		searchButton.addEventListener("click", this.close.bind(this));
		const cancelButton = controls.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", this.close.bind(this));
	}

	async onClose() {
		let { contentEl } = this;

		contentEl.empty();
		if (this.paperID) {
			await this.plugin.createPage(this.editor, this.paperID);
		}
	}
}

class arXivSettingTab extends PluginSettingTab {
	plugin: arXivPlugin;

	constructor(app: App, plugin: arXivPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Obsidian arXiv' });

		new Setting(containerEl)
		.setName("arXiv Extract Template")
		.setDesc(
		  `Set markdown template for extract to be inserted.\n
		  Available template variables are {{title}}, {{id}}, {{summary}}, {{authors}}, {{updated}}, and {{published}}.
		  `
		)
		.addTextArea((textarea) =>
		  textarea
			.setValue(this.plugin.settings.template)
			.onChange(async (value) => {
			  this.plugin.settings.template = value;
			  await this.plugin.saveSettings();
			})
		);
	}
}
