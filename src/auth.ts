import { App, Notice, requestUrl } from 'obsidian';
import { BetoNexusSettings } from './settings';
import { API_URL, PLUGIN_HEADERS } from './constants';
import { EncryptionService } from './encryption';

export class AuthManager {
	app: App;
	settings: BetoNexusSettings;
	saveSettings: () => Promise<void>;
	onAuthChange?: () => void;

	constructor(app: App, settings: BetoNexusSettings, saveSettings: () => Promise<void>, onAuthChange?: () => void) {
		this.app = app;
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.onAuthChange = onAuthChange;
	}

	async handleAuthCallback(code: string, silent: boolean = false): Promise<string | null> {
		if (!code) {
			new Notice('Authentication failed: No code received.');
			return null;
		}

		try {
			// Exchange code for token
			const encryptedPayload = await EncryptionService.encrypt({
				_action: 'auth/exchange-code',
				code,
				deviceId: this.settings.deviceId
			});

			const response = await requestUrl({
				url: `${API_URL}/api/ops`,
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					...PLUGIN_HEADERS
				},
				body: JSON.stringify(encryptedPayload)
			});

			if (response.status !== 200) {
				// console.error('Exchange failed:', response.status, response.text);
				throw new Error(`Failed to exchange code: ${response.status}`);
			}

			const data = response.json;
			let token = '';
			
			if (data.encrypted) {
				const decrypted = await EncryptionService.decrypt(data);
				token = decrypted.token;
			} else {
				token = data.token;
			}

			const previousToken = this.settings.authToken;
			this.settings.authToken = token;
			await this.saveSettings();
			
			// Only show notice if account actually changed (or was previously not logged in)
			if (!silent && token !== previousToken) {
				new Notice('Successfully logged in to Beto Marketplace!');
			}
			
			if (this.onAuthChange) this.onAuthChange();
			return token;
		} catch (error) {
			// console.error(error);
			new Notice('Authentication failed: Could not verify code.');
			return null;
		}
	}

	getAuthHeader(): Record<string, string> {
		if (this.settings.authToken) {
			return { 'Authorization': `Bearer ${this.settings.authToken}` };
		}
		return {};
	}

	logout() {
		this.settings.authToken = null;
		this.saveSettings();
		new Notice('Logged out.');
		if (this.onAuthChange) this.onAuthChange();
	}
}
