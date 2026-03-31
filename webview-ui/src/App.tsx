import { useState, useEffect, useRef } from 'react'
import './App.css'
import Settings from './Settings'

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  type?: 'status' | 'chunk' | 'diff';
  diffData?: any;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  mode: 'planning' | 'coding';
}

declare global {
  interface Window {
    vscode: {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(Date.now().toString());
  const [input, setInput] = useState('');
  const [view, setView] = useState<'chat' | 'settings' | 'history'>('chat');
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<'planning' | 'coding'>('coding');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || {
    id: currentSessionId, title: 'New Chat', messages: [], mode: mode
  };

  useEffect(() => {
    window.vscode.postMessage({ type: 'getHistory' });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'onHistory':
          setSessions(message.value);
          if (message.value.length > 0 && !currentSession.messages.length) {
            setCurrentSessionId(message.value[0].id);
          }
          break;
        case 'onAssistantChunk':
          updateCurrentSession((msg) => {
            const last = msg[msg.length - 1];
            if (last && last.sender === 'assistant' && last.type === 'chunk') {
                const newMsg = [...msg];
                newMsg[newMsg.length - 1] = { ...last, text: last.text + message.value };
                return newMsg;
            } else {
                return [...msg, { id: Date.now().toString(), text: message.value, sender: 'assistant', type: 'chunk' }];
            }
          });
          break;
        case 'onAssistantMessage':
          updateCurrentSession((msg) => [
            ...msg.filter(m => m.type !== 'status' && m.type !== 'chunk'), 
            { id: Date.now().toString(), text: message.value, sender: 'assistant' }
          ]);
          setIsGenerating(false);
          break;
        case 'requestDiffReview':
          updateCurrentSession((msg) => [
            ...msg, 
            { id: Date.now().toString(), text: `Proposed changes for ${message.value.filepath}`, sender: 'assistant', type: 'diff', diffData: message.value }
          ]);
          setIsGenerating(false);
          break;
        case 'onPatchApplied':
            updateCurrentSession((msg) => [
                ...msg,
                { id: Date.now().toString(), text: `Patch applied. Diagnosing...`, sender: 'assistant' }
            ]);
            break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentSessionId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [currentSession.messages, isGenerating]);

  const updateCurrentSession = (fn: (msgs: Message[]) => Message[]) => {
    setSessions(prev => {
        const index = prev.findIndex(s => s.id === currentSessionId);
        let newSessions = [...prev];
        const currentMsgs = index >= 0 ? prev[index].messages : [];
        const newMessages = fn(currentMsgs);
        
        let title = index >= 0 ? prev[index].title : 'New Chat';
        if (title === 'New Chat' && newMessages.length > 0) {
            const firstUserMsg = newMessages.find(m => m.sender === 'user');
            if (firstUserMsg) {
                title = firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
            }
        }

        if (index >= 0) {
            newSessions[index] = { ...prev[index], messages: newMessages, title, mode };
            // Move to top
            const item = newSessions.splice(index, 1)[0];
            newSessions.unshift(item);
        } else {
            newSessions.unshift({ id: currentSessionId, title, messages: newMessages, mode });
        }
        
        const updated = newSessions.find(s => s.id === currentSessionId);
        if (updated) { window.vscode.postMessage({ type: 'saveChat', value: updated }); }
        return newSessions;
    });
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user' };
    updateCurrentSession((msg) => [...msg, userMsg]);
    setIsGenerating(true);
    window.vscode.postMessage({ type: 'onUserMessage', value: input, mode });
    setInput('');
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    setCurrentSessionId(newId);
    setView('chat');
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => {
        const filtered = prev.filter(s => s.id !== id);
        window.vscode.postMessage({ type: 'deleteChat', value: id });
        if (id === currentSessionId) {
            setCurrentSessionId(filtered.length > 0 ? filtered[0].id : Date.now().toString());
        }
        return filtered;
    });
  };

  const commitPatch = (diff: any) => {
    window.vscode.postMessage({ type: 'commitPatch', value: diff });
    updateCurrentSession((msg) => msg.filter(m => m.id !== diff.messageId));
  };

  return (
    <div className="app-container">
      <header className="premium-header">
        <div className="header-left">
          <button className="icon-button" onClick={() => setView('history')} title="History"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>
          <h1 className="logo">Mirror<span>Code</span></h1>
        </div>
        <div className="header-actions">
          <select className="mode-select" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="coding">Coding</option>
            <option value="planning">Planning</option>
          </select>
          <button className="icon-button" onClick={() => setView('settings')} title="Settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-1-1 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
        </div>
      </header>

      {view === 'history' ? (
        <div className="history-view">
          <div className="history-header"><h3>Recent Chats</h3><button className="new-chat-btn" onClick={handleNewChat}>+ New Chat</button></div>
          <div className="history-list">
            {sessions.map(s => (
              <div key={s.id} className={`history-item ${s.id === currentSessionId ? 'active' : ''}`} onClick={() => {setCurrentSessionId(s.id); setView('chat');}}>
                <span className="history-title">{s.title}</span>
                <button className="delete-btn" onClick={(e) => deleteSession(s.id, e)} title="Delete Chat">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : view === 'chat' ? (
        <>
          <div className="chat-container" ref={chatContainerRef}>
            {currentSession.messages.map(msg => (
              <div key={msg.id} className={`message message-${msg.sender}`}>
                {msg.type === 'diff' ? (
                  <div className="diff-preview">
                    <p className="diff-file">{msg.diffData.filepath.split(/[\\/]/).pop()}</p>
                    <div className="diff-actions"><button onClick={() => commitPatch(msg.diffData)}>Apply Change</button></div>
                  </div>
                ) : msg.text}
              </div>
            ))}
            {isGenerating && <div className="typing-indicator">Mirror is working...</div>}
          </div>
          <div className="input-container">
            <div className="input-wrapper">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask anything..." />
              <button className={isGenerating ? "stop-button" : "send-button"} onClick={() => isGenerating ? window.vscode.postMessage({type:'onStopGeneration'}) : handleSend()}>
                {isGenerating ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>}
              </button>
            </div>
          </div>
        </>
      ) : (
        <Settings onBack={() => setView('chat')} />
      )}
    </div>
  )
}

export default App
