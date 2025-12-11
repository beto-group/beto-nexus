import { API_URL } from './constants';

export interface EncryptedPayload {
    encrypted: true;
    iv: string;
    data: string;
    tag: string;
    keyId: string;
}

export interface EncryptionKey {
    id: string;
    key: string; // base64
    expiresIn: number;
}

export class EncryptionService {
    private static currentKey: CryptoKey | null = null;
    private static currentKeyId: string | null = null;
    private static keyExpiry: number | null = null;

    static async init() {
        if (this.isValid()) return;
        await this.fetchKey();
    }

    private static isValid(): boolean {
        if (!this.currentKey || !this.keyExpiry) return false;
        return Date.now() < this.keyExpiry;
    }

    private static async fetchKey() {
        try {
            const response = await fetch(`${API_URL}/api/security/key`);
            if (!response.ok) throw new Error('Failed to fetch encryption key');
            
            const data: EncryptionKey = await response.json();
            
            const rawKey = Uint8Array.from(atob(data.key), c => c.charCodeAt(0));
            this.currentKey = await window.crypto.subtle.importKey(
                'raw',
                rawKey,
                { name: 'AES-GCM' },
                false,
                ['encrypt', 'decrypt']
            );
            
            this.currentKeyId = data.id;
            this.keyExpiry = Date.now() + (data.expiresIn * 1000) - 60000;
            
            console.log('[Encryption] Key rotated/loaded', this.currentKeyId);
        } catch (error) {
            console.error('[Encryption] Failed to init:', error);
            throw error;
        }
    }

    static arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    static async encrypt(data: any): Promise<EncryptedPayload> {
        await this.init();
        if (!this.currentKey || !this.currentKeyId) throw new Error('Encryption not ready');

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(JSON.stringify(data));

        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.currentKey,
            encodedData
        );

        const encryptedArray = new Uint8Array(encryptedBuffer);
        const tagLength = 16;
        const ciphertext = encryptedArray.slice(0, -tagLength);
        const tag = encryptedArray.slice(-tagLength);

        return {
            encrypted: true,
            iv: this.arrayBufferToBase64(iv.buffer),
            data: this.arrayBufferToBase64(ciphertext.buffer),
            tag: this.arrayBufferToBase64(tag.buffer),
            keyId: this.currentKeyId
        };
    }

    static async decrypt(payload: EncryptedPayload): Promise<any> {
        await this.init();
        
        if (!this.currentKey) throw new Error('Encryption key not available');

        const iv = this.base64ToArrayBuffer(payload.iv);
        const ciphertext = this.base64ToArrayBuffer(payload.data);
        const tag = this.base64ToArrayBuffer(payload.tag);

        const encryptedData = new Uint8Array(ciphertext.byteLength + tag.byteLength);
        encryptedData.set(new Uint8Array(ciphertext), 0);
        encryptedData.set(new Uint8Array(tag), ciphertext.byteLength);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            this.currentKey,
            encryptedData
        );

        const decodedData = new TextDecoder().decode(decryptedBuffer);
        return JSON.parse(decodedData);
    }
}
