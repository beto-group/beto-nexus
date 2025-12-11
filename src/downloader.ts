import { App, Notice, requestUrl, TFolder, TFile, normalizePath } from 'obsidian';
import { BetoNexusSettings } from './settings';
import { API_URL, PLUGIN_HEADERS } from './constants';
import * as JSZip from 'jszip';
import { SuccessModal } from './success-modal';
import { EncryptionService } from './encryption';

export class DatacoreDownloader {
	app: App;
	settings: BetoNexusSettings;

	constructor(app: App, settings: BetoNexusSettings) {
		this.app = app;
		this.settings = settings;
	}

	async downloadComponent(id: string, token: string) {
		// new Notice(`Downloading component...`);
		try {
			// Use encrypted gateway for download request
			const encryptedPayload = await EncryptionService.encrypt({
				_action: 'components/download',
				id
			});

			const response = await requestUrl({
				url: `${API_URL}/api/ops`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${token}`,
					'X-Device-Id': this.settings.deviceId,
					'Content-Type': 'application/json',
					...PLUGIN_HEADERS
				},
				body: JSON.stringify(encryptedPayload)
			});

			if (response.status !== 200) {
				throw new Error(`Download failed with status: ${response.status}`);
			}

			// Parse JSON response to get the R2 signed URL
			const data = response.json;
			let downloadUrl = '';
			let componentName = '';

			if (data.encrypted) {
				const decrypted = await EncryptionService.decrypt(data);
				downloadUrl = decrypted.url;
				componentName = decrypted.name;
			} else {
				downloadUrl = data.url;
				componentName = data.name;
			}

			if (!downloadUrl) {
				throw new Error("Invalid response from server: missing download URL");
			}
			
			if (!componentName) {
				try {
					// Fallback: Fetch component details to get the name
					// Also use encrypted gateway
					const compPayload = await EncryptionService.encrypt({
						_action: 'components/get',
						id
					});
					
					const compResponse = await requestUrl({
						url: `${API_URL}/api/ops`,
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...PLUGIN_HEADERS
						},
						body: JSON.stringify(compPayload)
					});

					if (compResponse.status === 200) {
						const compData = compResponse.json;
						if (compData.encrypted) {
							const decryptedComp = await EncryptionService.decrypt(compData);
							componentName = decryptedComp.name;
						} else {
							componentName = compData.name;
						}
					}
				} catch (e) {
					// Ignore error, fallback to ID
				}
			}
			componentName = componentName || id;
			
			// Second request: Download the actual file from R2 (no Auth header)
			const fileResponse = await requestUrl({
				url: downloadUrl,
				method: 'GET'
				// No headers, especially no Authorization header
			});

			if (fileResponse.status !== 200) {
				throw new Error(`File download failed with status: ${fileResponse.status}`);
			}

			const arrayBuffer = fileResponse.arrayBuffer;
			const extractedName = await this.extractZip(arrayBuffer, id);

			// Use extracted folder name if available, otherwise fallback to API name or ID
			const finalName = extractedName || componentName || id;

			// Find viewer file and open modal
			let viewerCode = '';
			let viewerFileName = '';
			if (extractedName) {
				const folderPath = normalizePath(`${this.settings.downloadFolder}/${extractedName}`);
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				
				if (folder instanceof TFolder) {
					const viewerFile = folder.children.find(file => {
						return file instanceof TFile && file.name.startsWith('D.q.') && file.name.includes('viewer') && file.name.endsWith('.md');
					}) as TFile | undefined;

					if (viewerFile) {
						viewerFileName = viewerFile.name;
						const content = await this.app.vault.read(viewerFile);
						// Extract full code block including backticks and language identifier (jsx or tsx)
						const match = content.match(/(```datacore(?:jsx|tsx)\n[\s\S]*?\n```)/);
						if (match && match[1]) {
							viewerCode = match[1];
						} else {
							viewerCode = content; 
						}
					}
				}
			}

			if (viewerCode) {
				new SuccessModal(this.app, finalName, viewerCode, viewerFileName).open();
			} else {
				new Notice(`Successfully installed: ${finalName}`);
			}

		} catch (error) {
			// console.error("Failed to deploy datacore component:", error);
			new Notice(`Deployment failed: ${error.message}`);
		}
	}

	async extractZip(buffer: ArrayBuffer, componentId: string): Promise<string | null> {
		const zip = await JSZip.loadAsync(buffer);
		// Use the configured download folder directly, do not create a subfolder for the ID
		const baseFolder = normalizePath(this.settings.downloadFolder);

		// Ensure base folder exists
		if (!this.app.vault.getAbstractFileByPath(baseFolder)) {
			await this.app.vault.createFolder(baseFolder);
		}

		let rootFolderName: string | null = null;
		const files = Object.keys(zip.files);
		
		// Try to determine the root folder name from the zip content
		if (files.length > 0) {
			// Sort to ensure we see top-level folders first if possible, though keys order isn't guaranteed
			// Just take the first path segment of the first file
			const firstPath = files[0];
			const parts = firstPath.split('/');
			if (parts.length > 0 && parts[0]) {
				rootFolderName = parts[0];
			}
		}

		for (const filename of files) {
			const file = zip.files[filename];
			if (file.dir) continue;

			const content = await file.async('arraybuffer');
			const filePath = normalizePath(`${baseFolder}/${filename}`);
			
			// SECURITY: Prevent Zip Slip attacks
			// Ensure the resolved path is still within the baseFolder
			if (!filePath.startsWith(baseFolder + '/')) {
				console.warn(`Security Warning: Skipping file "${filename}" as it attempts to write outside the download folder.`);
				continue;
			}

			// Ensure subdirectories exist
			const lastSlash = filePath.lastIndexOf('/');
			if (lastSlash > 0) {
				const parentDir = filePath.substring(0, lastSlash);
				await this.ensureFolderExists(parentDir);
			}

			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modifyBinary(existingFile, content);
			} else {
				await this.app.vault.createBinary(filePath, content);
			}
		}
		
		return rootFolderName;
	}

	async ensureFolderExists(path: string) {
		const folders = path.split('/');
		let currentPath = '';
		for (const folder of folders) {
			currentPath = currentPath === '' ? folder : `${currentPath}/${folder}`;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}
}
