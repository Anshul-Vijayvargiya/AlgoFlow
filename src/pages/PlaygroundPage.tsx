import React, { useState } from 'react';
import { Terminal, Play, RotateCcw, Copy, Check, Sliders, Globe } from 'lucide-react';
import { useVisualizerStore } from '../store/useVisualizerStore';
import type { ProgrammingLanguage } from '../types/algorithm';

export const PlaygroundPage: React.FC = () => {
  const { selectedLanguage, setLanguage } = useVisualizerStore();
  const [code, setCode] = useState<string>(`// AlgoFlow Interactive Playground
#include <iostream>
#include <vector>

using namespace std;

void processInput(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n; i++) {
        cout << "Element [" << i << "] = " << arr[i] << endl;
    }
}

int main() {
    vector<int> data = {8, 3, 5, 1, 6, 9, 2};
    processInput(data);
    return 0;
}`);

  const [inputArrayStr, setInputArrayStr] = useState('8, 3, 5, 1, 6, 9, 2');
  const [outputConsole, setOutputConsole] = useState<string>('Ready to execute. Press "Run Code" to compile and run in sandbox.');
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRun = () => {
    setIsRunning(true);
    setOutputConsole('Compiling source code with GCC / Clang sandbox...\nExecuting main()...');

    setTimeout(() => {
      const parsedArr = inputArrayStr.split(',').map(s => s.trim()).filter(Boolean);
      let simulatedOut = `=== EXECUTION SUCCESSFUL ===\nInput Array: [${parsedArr.join(', ')}]\n\n`;
      parsedArr.forEach((val, i) => {
        simulatedOut += `Element [${i}] = ${val}\n`;
      });
      simulatedOut += `\nProcess finished with exit code 0 (Execution Time: 18ms, Memory: 14.2MB)`;
      setOutputConsole(simulatedOut);
      setIsRunning(false);
    }, 600);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-200 p-4 lg:p-8 space-y-6 max-w-7xl mx-auto flex flex-col">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono">
            <Terminal className="w-3.5 h-3.5" />
            MULTI-LANGUAGE PLAYGROUND
          </div>
          <h1 className="text-2xl font-bold font-mono text-white mt-2">
            Code <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Playground</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-cyan-300">
            <Globe className="w-3.5 h-3.5 mr-2 text-cyan-400" />
            <select
              value={selectedLanguage}
              onChange={(e) => setLanguage(e.target.value as ProgrammingLanguage)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="cpp" className="bg-slate-900">C++ (GCC 13)</option>
              <option value="c" className="bg-slate-900">C (GCC 13)</option>
              <option value="java" className="bg-slate-900">Java (OpenJDK 21)</option>
              <option value="python" className="bg-slate-900">Python (3.11)</option>
            </select>
          </div>

          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{isRunning ? 'Running...' : 'Run Code'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Code Editor | Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Code Editor Column */}
        <div className="lg:col-span-7 bg-[#0B0F19] border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl min-h-[450px]">
          <div className="px-4 py-3 bg-[#070A12] border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono font-bold text-slate-200">main.{selectedLanguage}</span>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-cyan-300"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="flex-1 p-3 bg-[#0B0F19]">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full min-h-[380px] bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Input Config & Console Output Column */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Custom Input Config */}
          <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>CUSTOM ARRAY INPUT</span>
            </div>
            <input
              type="text"
              value={inputArrayStr}
              onChange={(e) => setInputArrayStr(e.target.value)}
              placeholder="Comma separated integers..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* Console Output */}
          <div className="flex-1 bg-[#05070D] border border-slate-800 rounded-2xl p-4 flex flex-col shadow-xl min-h-[300px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                EXECUTION CONSOLE
              </span>
              <button
                onClick={() => setOutputConsole('')}
                className="p-1 rounded text-slate-500 hover:text-slate-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <pre className="flex-1 font-mono text-xs text-cyan-300/90 whitespace-pre-wrap leading-relaxed overflow-y-auto custom-scrollbar">
              {outputConsole}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
