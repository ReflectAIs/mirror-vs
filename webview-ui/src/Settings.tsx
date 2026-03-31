import { useState, useEffect } from 'react'

interface SettingsProps {
  onBack: () => void;
}

interface SettingsData {
  ollamaUrl: string;
  ollamaModel: string;
}

export default function Settings({ onBack }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsData>({
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'codellama'
  });
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    // Request current settings from extension
    window.vscode.postMessage({ type: 'getSettings' });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'onSettings') {
        setSettings(message.value);
        fetchModels(message.value.ollamaUrl);
      } else if (message.type === 'onModels') {
        setModels(message.data || message.value || []);
        setIsLoadingModels(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchModels = (url: string) => {
    setIsLoadingModels(true);
    window.vscode.postMessage({ 
      type: 'fetchModels', 
      value: { ollamaUrl: url } 
    });
  };

  const handleSave = () => {
    window.vscode.postMessage({
      type: 'updateSettings',
      value: settings
    });
  };

  return (
    <div className="settings-view">
      <header className="settings-header">
        <button className="back-button" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <h2>Settings</h2>
      </header>

      <div className="settings-content">
        <div className="setting-item">
          <label>Ollama URL</label>
          <div className="input-with-action">
            <input 
              type="text" 
              value={settings.ollamaUrl} 
              onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
            <button className="icon-button" onClick={() => fetchModels(settings.ollamaUrl)} title="Refresh Models">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoadingModels ? 'spinning' : ''}>
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
          </div>
        </div>

        <div className="setting-item">
          <label>Model Name</label>
          {models.length > 0 ? (
            <select 
              value={settings.ollamaModel} 
              onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
            >
              {models.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          ) : (
            <input 
              type="text" 
              value={settings.ollamaModel} 
              onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
              placeholder="e.g. codellama"
            />
          )}
          <p className="setting-hint">
            {models.length > 0 ? `${models.length} models found` : 'No models found. Ensure Ollama is running.'}
          </p>
        </div>

        <button className="save-button" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  )
}

