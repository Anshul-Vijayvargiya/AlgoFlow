import React, { useState } from 'react';
import { Sparkles, Bot, Send, X, Cpu, Lightbulb } from 'lucide-react';
import { useVisualizerStore } from '../../store/useVisualizerStore';
import { getAlgorithmById } from '../../data/algorithmMetadata';

interface AITutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const AITutorDrawer: React.FC<AITutorDrawerProps> = ({ isOpen, onClose }) => {
  const { selectedAlgorithm, selectedLanguage, steps, currentStepIndex } = useVisualizerStore();
  const meta = getAlgorithmById(selectedAlgorithm);
  const currentStep = steps[currentStepIndex];

  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'ai',
      text: `Hello! I'm your AI DSA Tutor. You are currently viewing **${meta.name}** (${meta.category}). How can I help you understand this step or concept better?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  if (!isOpen) return null;

  const handleSend = (textToSend?: string) => {
    const q = textToSend || inputQuery;
    if (!q.trim()) return;

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setIsTyping(true);

    // Simulate AI intelligent context-aware response
    setTimeout(() => {
      let aiText = '';
      if (q.toLowerCase().includes('step') || q.toLowerCase().includes('explain')) {
        aiText = `At step ${currentStepIndex + 1} of ${steps.length}, ${meta.name} executes: "${currentStep?.message || 'Initialization'}". The algorithm evaluates: ${currentStep?.explanation || 'Setting up variables'}.`;
      } else if (q.toLowerCase().includes('complexity') || q.toLowerCase().includes('time')) {
        aiText = `For ${meta.name}, average time complexity is **${meta.timeComplexity.average}** (worst: ${meta.timeComplexity.worst}). Space complexity is **${meta.spaceComplexity}**. Best for: ${meta.bestFor}.`;
      } else if (q.toLowerCase().includes('debug') || q.toLowerCase().includes('code')) {
        aiText = `The current code snippet in **${selectedLanguage.toUpperCase()}** handles loop conditions carefully. Make sure your loop bounds don't cause buffer overflows.`;
      } else {
        aiText = `Great question regarding ${meta.name}! In DSA, ${meta.subtitle} This pattern is frequently asked in technical interviews for array/searching optimization.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: 'ai_' + Date.now(),
          sender: 'ai',
          text: aiText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setIsTyping(false);
    }, 700);
  };

  const quickPrompts = [
    { label: 'Explain current step', query: 'Explain what is happening at the current step' },
    { label: 'Analyze complexity', query: 'What is the time and space complexity of this algorithm?' },
    { label: 'How to optimize?', query: 'Is there an optimal approach or variation?' },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-[#070A12] border-l border-cyan-500/30 z-50 flex flex-col shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="p-4 bg-[#0B0F19] border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-glow-cyan">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-mono text-white">AI DSA Tutor</h3>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                PRO ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Context: {meta.name}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-none shadow-lg'
                  : 'bg-[#0B0F19] border border-slate-800 text-slate-200 rounded-bl-none shadow-md'
              }`}
            >
              {m.sender === 'ai' && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span>AlgoFlow AI Assistant</span>
                </div>
              )}
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
            <span className="text-[9px] font-mono text-slate-600 mt-1 px-1">{m.timestamp}</span>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-xs text-cyan-400 font-mono p-2 bg-[#0B0F19] rounded-xl border border-slate-800 w-fit">
            <Cpu className="w-3.5 h-3.5 animate-spin" />
            <span>AI is analyzing algorithm state...</span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-2 bg-[#0B0F19]/50 border-t border-slate-900 flex flex-wrap gap-1.5 shrink-0">
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(qp.query)}
            className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/40 transition-all flex items-center gap-1"
          >
            <Lightbulb className="w-2.5 h-2.5 text-amber-400" />
            {qp.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="p-3 bg-[#0B0F19] border-t border-slate-800 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ask AI about this algorithm..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 font-sans"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white disabled:opacity-40 transition-all shadow-glow-cyan"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
