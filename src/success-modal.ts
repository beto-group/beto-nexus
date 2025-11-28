import { App, Modal, setIcon, Notice } from 'obsidian';

export class SuccessModal extends Modal {
    componentName: string;
    viewerCode: string;
    viewerFileName: string;

    constructor(app: App, componentName: string, viewerCode: string, viewerFileName: string) {
        super(app);
        this.componentName = componentName;
        this.viewerCode = viewerCode;
        this.viewerFileName = viewerFileName;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('beto-success-modal');

        // Header
        const header = contentEl.createDiv({ cls: 'beto-modal-header' });
        const iconSpan = header.createSpan({ cls: 'beto-modal-icon' });
        setIcon(iconSpan, 'check-circle');
        header.createEl('h2', { text: 'IMPORT SUCCESSFUL!' });

        // Close button (Obsidian modals usually have one, but we can add a custom one or rely on default)
        // The default one is usually in the top right.

        // Component Info
        const infoBox = contentEl.createDiv({ cls: 'beto-modal-info-box' });
        infoBox.createDiv({ cls: 'beto-modal-label', text: 'COMPONENT IMPORTED:' });
        infoBox.createDiv({ cls: 'beto-modal-name', text: this.componentName });

        // Requirement Warning (Only if Datacore is not enabled)
        // @ts-ignore
        const isDatacoreEnabled = this.app.plugins?.getPlugin('datacore');
        
        if (!isDatacoreEnabled) {
            const reqBox = contentEl.createDiv({ cls: 'beto-modal-req-box' });
            const reqIcon = reqBox.createSpan({ cls: 'beto-req-icon' });
            setIcon(reqIcon, 'alert-triangle');
            
            const reqContent = reqBox.createDiv({ cls: 'beto-req-content' });
            reqContent.createDiv({ text: "Requires Datacore Plugin", cls: 'beto-req-title' });
            reqContent.createDiv({ text: "This component relies on the Datacore plugin to function.", cls: 'beto-req-desc' });

            const reqBtn = reqBox.createEl('button', { cls: 'beto-req-btn', text: "Get Datacore" });
            reqBtn.onclick = () => {
                window.open('obsidian://show-plugin?id=datacore');
            };
        }

        // Viewer Code Section
        contentEl.createEl('h3', { text: 'VIEWER CODE', cls: 'beto-modal-section-title' });
        contentEl.createDiv({ cls: 'beto-modal-desc', text: `Copy this viewer code to use the ${this.componentName} component in VAULT:` });

        const codeContainer = contentEl.createDiv({ cls: 'beto-code-container' });
        
        // We want the copy button inside the container, top right
        const copyBtn = codeContainer.createEl('button', { cls: 'beto-copy-btn' });
        copyBtn.createSpan({ text: 'Copy' });
        const copyIcon = copyBtn.createSpan({ cls: 'beto-copy-icon' });
        setIcon(copyIcon, 'copy');

        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(this.viewerCode);
            new Notice('Code copied to clipboard!');
            const span = copyBtn.querySelector('span');
            if (span) {
                span.setText('Copied!');
                setTimeout(() => {
                    span.setText('Copy');
                }, 2000);
            }
        };

        const pre = codeContainer.createEl('pre');
        pre.createEl('code', { text: this.viewerCode });

        // Instructions
        const instructions = contentEl.createDiv({ cls: 'beto-modal-instructions' });
        const tipIcon = instructions.createSpan({ cls: 'beto-modal-tip-icon' });
        setIcon(tipIcon, 'lightbulb');
        
        const steps = instructions.createDiv({ cls: 'beto-modal-steps' });
        steps.createEl('div', { text: 'How to use this viewer:', cls: 'beto-modal-step-title' });
        const ul = steps.createEl('ul');
        ul.createEl('li', { text: 'Paste the copied code directly into any markdown file.' });
        ul.createEl('li', { text: `The viewer will automatically render the ${this.componentName} component` });
        ul.createEl('li', { text: `You can find this code again in the "${this.viewerFileName}" file inside the component folder.` });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
