import React, { useState, useEffect, useRef } from 'react'
import { VscSend, VscHistory, VscSettingsGear, VscTrash, VscArrowLeft, VscLoading, VscTerminal, VscSearch, VscFile, VscFolder, VscStopCircle } from 'react-icons/vsc'
import './App.css'
import Settings from './Settings'
import defaultLogo from './assets/logo.png'

import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

declare global {
  interface Window {
    vscode: any;
  }
}

interface ToolTrace {
  label: string;
  category: 'analyzing' | 'planning' | 'executing';
  result?: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  type?: 'chunk' | 'step' | 'trace' | 'diff' | 'status';
  stepData?: any;
  traceData?: ToolTrace;
  diffData?: any;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  mode: 'planning' | 'coding';
}

declare const vscode: any;

function App() {
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
   const [currentSessionId, setCurrentSessionId] = useState<string>(Date.now().toString());
   const [generatingSessions, setGeneratingSessions] = useState<Record<string, boolean>>({});
   const isGenerating = generatingSessions[currentSessionId] || false;
  const [view, setView] = useState<'chat' | 'history' | 'settings'>('chat');
  const [mode, setMode] = useState<'planning' | 'coding'>('planning');
  const [logoUri, setLogoUri] = useState<string>(defaultLogo);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || {
    id: currentSessionId, title: 'New Chat', messages: [], mode: mode
  };

  useEffect(() => {
    window.vscode.postMessage({ type: 'ready' });
    window.vscode.postMessage({ type: 'getHistory' });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'onInitialize':
          if (message.value.logoUri) setLogoUri(message.value.logoUri);
          break;
         case 'onHistory':
           if (message.value) setSessions(message.value);
           break;
         case 'onActiveGenerations':
           if (message.value) {
             const activeMap: Record<string, boolean> = {};
             message.value.forEach((id: string) => activeMap[id] = true);
             setGeneratingSessions(activeMap);
           }
           break;
         case 'onAssistantChunk':
           updateSession(message.sessionId || currentSessionId, (msg) => {
             const last = msg[msg.length - 1];
             if (last && last.sender === 'assistant' && last.type === 'chunk') {
                 const newMsg = [...msg];
                 newMsg[newMsg.length - 1] = { ...last, text: last.text + message.value };
                 return newMsg;
             } else {
                 return [...msg, { id: Date.now().toString(), text: message.value, sender: 'assistant', type: 'chunk' }];
             }
           }, false);
           break;
         case 'onAssistantMessage':
           updateSession(message.sessionId || currentSessionId, (msg) => [
             ...msg.filter(m => m.type !== 'status' && m.type !== 'chunk'), 
             { id: Date.now().toString(), text: message.value, sender: 'assistant' }
           ], false);
           if (message.sessionId) {
             setGeneratingSessions(prev => ({ ...prev, [message.sessionId]: false }));
           }
           break;
         case 'onToolTrace':
           updateSession(message.sessionId || currentSessionId, (msg) => {
             const last = msg[msg.length - 1];
             if (last && last.type === 'trace' && last.traceData?.label === message.value.label) {
                 const newMsg = [...msg];
                 newMsg[newMsg.length - 1] = { ...last, traceData: message.value };
                 return newMsg;
             }
             return [
               ...msg,
               { id: Date.now().toString(), text: '', sender: 'assistant', type: 'trace', traceData: message.value }
             ];
           }, false);
           break;
         case 'onAssistantComplete':
           if (message.sessionId) {
             setGeneratingSessions(prev => ({ ...prev, [message.sessionId]: false }));
           }
           break;
         case 'requestDiffReview':
           updateSession(message.sessionId || currentSessionId, (msg) => [
             ...msg, 
             { id: Date.now().toString(), text: `Proposed changes for ${message.value.filepath}`, sender: 'assistant', type: 'diff', diffData: message.value }
           ], false);
           if (message.sessionId) {
             setGeneratingSessions(prev => ({ ...prev, [message.sessionId]: false }));
           }
           break;
         case 'onPatchApplied':
             updateSession(message.sessionId || currentSessionId, (msg) => [
                 ...msg,
                 { id: Date.now().toString(), text: `Patch applied. Diagnosing...`, sender: 'assistant' }
             ], false);
             break;
       }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentSessionId]);

  useEffect(() => {
    const scroller = chatContainerRef.current;
    if (scroller) {
      requestAnimationFrame(() => {
        scroller.scrollTo({
          top: scroller.scrollHeight,
          behavior: isGenerating ? 'auto' : 'smooth'
        });
      });
    }
  }, [currentSession.messages, isGenerating]);

  const updateSession = (sid: string, fn: (msgs: Message[]) => Message[], bubbleToTop = true) => {
    setSessions(prev => {
        const index = prev.findIndex(s => s.id === sid);
        let newSessions = [...prev];
        const newMessages = fn(index >= 0 ? prev[index].messages : []);
        const title = newMessages.find(m => m.sender === 'user')?.text.substring(0, 30) || 'New Chat';

        if (index >= 0) {
            newSessions[index] = { ...prev[index], messages: newMessages, title, mode };
            if (bubbleToTop) {
                const item = newSessions.splice(index, 1)[0];
                newSessions.unshift(item);
            }
        } else {
            newSessions.unshift({ id: sid, title, messages: newMessages, mode });
        }
        window.vscode.postMessage({ type: 'saveChat', value: newSessions.find(s => s.id === sid) });
        return newSessions;
    });
  };

  const updateCurrentSession = (fn: (msgs: Message[]) => Message[], bubbleToTop = true) => {
      updateSession(currentSessionId, fn, bubbleToTop);
  };

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user' };
    updateCurrentSession((msg) => [...msg, userMsg], true);
    setGeneratingSessions(prev => ({ ...prev, [currentSessionId]: true }));
    window.vscode.postMessage({ type: 'onUserMessage', value: input, mode, sessionId: currentSessionId });
    setInput('');
  };

  const handleStop = () => {
    window.vscode.postMessage({ type: 'stopGeneration', sessionId: currentSessionId });
    setGeneratingSessions(prev => ({ ...prev, [currentSessionId]: false }));
  };

  const switchSession = (id: string) => {
    setCurrentSessionId(id);
    setView('chat');
  };

  const startNewChat = () => {
    const newId = Date.now().toString();
    setCurrentSessionId(newId);
    setView('chat');
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    window.vscode.postMessage({ type: 'deleteChat', value: id });
    if (currentSessionId === id && newSessions.length > 0) {
      setCurrentSessionId(newSessions[0].id);
    } else if (newSessions.length === 0) {
      startNewChat();
    }
  };

  const commitPatch = (diff: any) => {
    window.vscode.postMessage({ type: 'commitPatch', value: diff });
    updateCurrentSession((msg) => msg.filter(m => m.id !== diff.messageId), false);
  };

  const getToolIcon = (label: string) => {
    if (label.includes('Listing')) return <VscFolder />;
    if (label.includes('Reading') || label.includes('Skeleton')) return <VscFile />;
    if (label.includes('Searching')) return <VscSearch />;
    if (label.includes('Terminal')) return <VscTerminal />;
    return <VscSettingsGear />;
  };

  return (
    <div className="app-container">
      <header className="minimal-header">
        <div className="brand">
          <img src={logoUri} className="logo-img" alt="logo" />
          <div className="brand-name">MIRROR <span>CODE</span></div>
          <select className="mode-select" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="planning">Planning</option>
            <option value="coding">Coding</option>
          </select>
        </div>
        <div className="header-right">
          <button className="nav-btn" onClick={() => setView('history')}><VscHistory /></button>
          <button className="nav-btn" onClick={() => setView('settings')}><VscSettingsGear /></button>
        </div>
      </header>

      {view === 'chat' && (
        <main className="chat-interface">
          <div className="scroller" ref={chatContainerRef}>
            {currentSession.messages.map((msg, i) => {
                const isStacked = i > 0 && currentSession.messages[i-1].sender === msg.sender && currentSession.messages[i-1].type !== 'trace';
                return (
                  <div key={msg.id} className={`message sender-${msg.sender} ${isStacked ? 'stacked' : ''} type-${msg.type || 'text'}`}>
                    {!isStacked && <div className="label">{msg.sender === 'user' ? 'YOU' : 'MIRROR'}</div>}
                    <div className="bubble">
                      {msg.type === 'trace' ? (
                        <div className="tool-trace-card">
                          <div className={`trace-header category-${msg.traceData?.category}`}>
                            {getToolIcon(msg.traceData?.label || '')}
                            <span className="trace-label">{msg.traceData?.label}</span>
                          </div>
                          {msg.traceData?.result && (
                            <div className="trace-result">{msg.traceData.result}</div>
                          )}
                        </div>
                      ) : msg.type === 'diff' ? (
                        <div className="diff-card">
                          <div className="diff-header">{msg.text}</div>
                          <button className="apply-btn" onClick={() => commitPatch(msg.diffData)}>Apply Change</button>
                        </div>
                      ) : (
                        <div className="text markdown-body">
                          <ReactMarkdown
                            components={{
                              code({node, inline, className, children, ...props}: any) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    {...props}
                                    children={String(children).replace(/\n$/, '')}
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                  />
                                ) : (
                                  <code {...props} className={className}>
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                )
            })}
            {isGenerating && <div className="message sender-assistant"><div className="bubble thinking"><VscLoading className="spinning" /> Thinking...</div></div>}
          </div>

          <footer className="composer">
            <div className="input-group">
              <textarea 
                value={input} 
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Talk to Mirror..."
                rows={1}
              />
              <button className={`send-btn ${isGenerating ? 'stop' : ''}`} onClick={isGenerating ? handleStop : handleSend}>
                {isGenerating ? <VscStopCircle /> : <VscSend />}
              </button>
            </div>
          </footer>
        </main>
      )}

      {view === 'history' && (
        <div className="history-view">
          <div className="history-header">
            <button className="back-button" onClick={() => setView('chat')}><VscArrowLeft /></button>
            <h3>Recent Activity</h3>
            <button className="new-chat-btn" onClick={startNewChat}>+ New</button>
          </div>
          <div className="history-list">
            {sessions.map(s => (
              <div key={s.id} className={`history-item ${s.id === currentSessionId ? 'active' : ''}`} onClick={() => switchSession(s.id)}>
                <div className="history-info">
                  <div className="history-title">{s.title || 'Empty chat'}</div>
                  <div className="history-type">{s.mode} mode</div>
                </div>
                <button className="delete-btn" onClick={(e) => deleteSession(s.id, e)}><VscTrash /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'settings' && <Settings onBack={() => setView('chat')} />}
    </div>
  )
}

export default App