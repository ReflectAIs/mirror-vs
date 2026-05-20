import * as vscode from 'vscode';

export class SecretService {
  constructor(private readonly _secrets: vscode.SecretStorage) {}

  /**
   * Retrieves a secret from storage.
   */
  public async getSecret(key: string): Promise<string | undefined> {
    return await this._secrets.get(key);
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
