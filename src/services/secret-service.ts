import * as vscode from 'vscode';

export class SecretService {
  private static _instance: SecretService | undefined;

  constructor(private readonly _secrets: vscode.SecretStorage) {
    SecretService._instance = this;
  }

  /**
   * Retrieves the singleton instance. Must be initialized with constructor first.
   */
  public static getInstance(): SecretService {
    if (!SecretService._instance) {
      throw new Error('SecretService not initialized. Call constructor with SecretStorage first.');
    }
    return SecretService._instance;
  }

  /**
   * Retrieves a secret from storage.
   */
  public async getSecret(key: string): Promise<string | undefined> {
    return await this._secrets.get(key);
  }

  /**
   * Alias for getSecret for convenience.
   */
  public async get(key: string): Promise<string | undefined> {
    return this.getSecret(key);
  }

  /**
   * Stores a secret securely in the OS-level keychain.
   */
  public async storeSecret(key: string, value: string): Promise<void> {
    await this._secrets.store(key, value);
  }

  /**
   * Deletes a secret from storage.
   */
  public async deleteSecret(key: string): Promise<void> {
    await this._secrets.delete(key);
  }

  /**
   * Checks whether a secret with the given key is currently set and is not empty.
   */
  public async hasSecret(key: string): Promise<boolean> {
    const value = await this.getSecret(key);
    return !!value && value.trim().length > 0;
  }
}
