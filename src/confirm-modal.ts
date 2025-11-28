import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;

    constructor(app: App, title: string, message: string, onConfirm: () => void, onCancel?: () => void) {
        super(app);
        this.title = title;
        this.message = message;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel || (() => {});
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('beto-confirm-modal');

        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { text: this.message });

        const buttonContainer = contentEl.createDiv({ cls: 'beto-modal-button-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => {
            this.onCancel();
            this.close();
        };

        const confirmBtn = buttonContainer.createEl('button', { cls: 'mod-cta', text: 'Install' });
        confirmBtn.onclick = () => {
            this.onConfirm();
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
