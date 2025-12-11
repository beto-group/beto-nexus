import { App, TFolder, TFile, Notice, normalizePath } from 'obsidian';
import { BetoNexusSettings } from './settings';

export interface InstalledComponent {
	id: string;
	name: string; // Could be read from a manifest.json inside the component if it exists
	path: string;
	installDate?: number;
}

export class ComponentManager {
	app: App;
	settings: BetoNexusSettings;

	constructor(app: App, settings: BetoNexusSettings) {
		this.app = app;
		this.settings = settings;
	}

	async getInstalledComponents(): Promise<InstalledComponent[]> {
		const downloadFolder = normalizePath(this.settings.downloadFolder);
		const folder = this.app.vault.getAbstractFileByPath(downloadFolder);
		
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const components: InstalledComponent[] = [];

		for (const child of folder.children) {
			if (child instanceof TFolder) {
				// This is a component folder
				components.push({
					id: child.name,
					name: child.name, // TODO: Read from manifest inside folder
					path: child.path,
					installDate: 0 // TFolder doesn't expose stat in public API easily
				});
			} else if (child instanceof TFile && child.extension === 'zip') {
				// It's a zip file that hasn't been extracted or is just sitting there
				components.push({
					id: child.basename,
					name: child.basename + " (Archive)",
					path: child.path,
					installDate: child.stat.ctime
				});
			}
		}

		return components;
	}

	async deleteComponent(id: string) {
		const path = normalizePath(`${this.settings.downloadFolder}/${id}`);
		const file = this.app.vault.getAbstractFileByPath(path);
		
		if (file) {
			await this.app.vault.trash(file, true); // Use trash instead of rmdir
			new Notice(`Deleted component: ${id}`);
		} else {
			new Notice(`Component not found: ${id}`);
		}
	}
}
