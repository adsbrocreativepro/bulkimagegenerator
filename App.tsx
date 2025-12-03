import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppStatus, CharacterDNA, GeneratedImage, LogEntry } from './types';
import { analyzeCharacterImage, generateCharacterImage, editGeneratedImage, STORAGE_KEY } from './services/geminiService';
import EditorModal from './components/EditorModal';
import ApiKeyModal from './components/ApiKeyModal';

const App: React.FC = () => {
  // State: API Key Check
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [checkingKey, setCheckingKey] = useState<boolean>(true);
  const [showManualKeyModal, setShowManualKeyModal] = useState<boolean>(false);

  // State: App Status & Logs
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // State: Character DNA
  const [charImage, setCharImage] = useState<string | null>(null);
  const [charName, setCharName] = useState('');
  const [dnaPrompt, setDnaPrompt] = useState('');
  const [globalStyle, setGlobalStyle] = useState('');

  // State: Bulk Input
  const [bulkPrompts, setBulkPrompts] = useState('');

  // State: Results
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [progress, setProgress] = useState(0);

  // State: Editor
  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null);

  // State: Safety & Throttling
  const [safeMode, setSafeMode] = useState<boolean>(true); // Default ON for Free Tier
  const [cooldownTimer, setCooldownTimer] = useState<number>(0);

  // Constants
  const MAX_PROMPTS = 50;

  // Helper: Logging
  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    // Clean up JSON error messages if they slip through
    let cleanMessage = message;
    
    if (message.includes('{') && message.includes('}')) {
      try {
        // Try to see if it's a JSON string
        if (message.includes("quota") || message.includes("429")) {
          cleanMessage = "Rate Limit Hit. Waiting automatically before retrying...";
        } else if (message.includes("403")) {
           cleanMessage = "Permission Denied (403). Check Billing or Domain.";
        }
      } catch (e) {
        // ignore parsing error
      }
    }

    setLogs(prev => [...prev, {
      id: uuidv4(),
      message: cleanMessage,
      type,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Check for API Key on mount (Local Storage or Window Object)
  useEffect(() => {
    const checkKey = async () => {
      try {
        // 1. Check Local Storage
        const localKey = localStorage.getItem(STORAGE_KEY);
        if (localKey) {
          setHasApiKey(true);
          setCheckingKey(false);
          return;
        }

        // 2. Check AI Studio Environment
        if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
          setHasApiKey(true);
        }
      } catch (e) {
        console.error("Error checking API key status", e);
      } finally {
        setCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  const handleConnectApiKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true); 
      }
    } catch (e) {
      console.error("Failed to select key", e);
      setHasApiKey(false);
    }
  };

  const handleManualKeySuccess = () => {
    setHasApiKey(true);
    setShowManualKeyModal(false);
  };

  const handleRemoveKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHasApiKey(false);
    window.location.reload(); 
  };

  // Handler: Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharImage(reader.result as string);
        addLog(`Image loaded: ${file.name}`, 'info');
      };
      reader.readAsDataURL(file);
    }
  };

  // Handler: Analyze Character
  const handleAnalyze = async () => {
    if (!charImage) {
      addLog("Please upload an image first.", 'error');
      return;
    }
    
    setStatus(AppStatus.ANALYZING);
    addLog("Analyzing character DNA with Gemini Vision...", 'info');

    try {
      const result = await analyzeCharacterImage(charImage);
      setDnaPrompt(result.dna);
      setGlobalStyle(result.style);
      addLog("Character DNA extracted successfully.", 'success');
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Analysis failed", 'error');
    } finally {
      setStatus(AppStatus.IDLE);
    }
  };

  // Handler: Generate Bulk
  const handleBulkGenerate = async () => {
    const lines = bulkPrompts.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      addLog("Please enter at least one prompt.", 'error');
      return;
    }
    if (!dnaPrompt) {
      addLog("Warning: No Character DNA detected. Results may be inconsistent.", 'info');
    }

    setStatus(AppStatus.GENERATING);
    setProgress(0);
    
    // Limit to MAX_PROMPTS
    const linesToProcess = lines.slice(0, MAX_PROMPTS);
    const total = linesToProcess.length;

    if (lines.length > MAX_PROMPTS) {
      addLog(`Note: Only processing first ${MAX_PROMPTS} prompts.`, 'info');
    }

    // THE SKIP & SURVIVE LOOP
    for (let i = 0; i < linesToProcess.length; i++) {
      const scene = linesToProcess[i];
      const finalPrompt = `
        Character Details: ${dnaPrompt}
        Art Style: ${globalStyle}
        Action/Scene: ${scene}
        Quality: 8k, sharp focus, detailed, masterpiece.
      `.trim();

      addLog(`Generating ${i + 1}/${total}: "${scene}"...`, 'info');

      let success = false;
      try {
        const imageUrl = await generateCharacterImage(finalPrompt);
        
        const newImage: GeneratedImage = {
          id: uuidv4(),
          url: imageUrl,
          prompt: scene,
          basePrompt: scene,
          timestamp: Date.now()
        };

        setGeneratedImages(prev => [newImage, ...prev]);
        addLog(`SUCCESS: Generated "${scene}"`, 'success');
        success = true;
      } catch (error) {
        // Show detailed error message from service
        let errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        // Handle Rate Limits gracefully in the loop
        if (errorMessage.includes("Quota") || errorMessage.includes("Rate limit") || errorMessage.includes("429")) {
          addLog(`LIMIT HIT: Quota exhausted on "${scene}".`, 'error');
          
          // FORCE LONG WAIT TO RESET QUOTA (60s)
          const recoveryTime = 60; 
          addLog(`WAITING: Pausing for ${recoveryTime}s to reset Free Tier quota...`, 'info');
          
          for (let t = recoveryTime; t > 0; t--) {
             setCooldownTimer(t);
             await new Promise(r => setTimeout(r, 1000));
          }
          setCooldownTimer(0);
          
          addLog(`RESUMING: Moving to next prompt...`, 'info');
          // We intentionally do NOT retry the same image, we skip to the next to ensure progress.
        } else {
          addLog(`FAILED "${scene}": ${errorMessage}`, 'error');
        }
      }

      setProgress(((i + 1) / total) * 100);
      
      // Standard cooldown logic between successful items
      if (success && i < linesToProcess.length - 1) {
        if (safeMode) {
          // Free Tier Safe Mode: 20s
          const waitTime = 20; 
          addLog(`Safe Mode: Cooling down for ${waitTime}s...`, 'info');
          
          for (let t = waitTime; t > 0; t--) {
            setCooldownTimer(t);
            await new Promise(r => setTimeout(r, 1000));
          }
          setCooldownTimer(0);
        } else {
          // Fast Mode (Paid): 1s
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    setStatus(AppStatus.IDLE);
    addLog("Bulk generation sequence finished.", 'success');
  };

  // Handler: Edit Image (Smart Edit)
  const handleSmartEdit = async (imageId: string, editPrompt: string) => {
    const imageToEdit = generatedImages.find(img => img.id === imageId);
    if (!imageToEdit) return;

    setStatus(AppStatus.EDITING);
    addLog(`Editing image with instruction: "${editPrompt}"...`, 'info');

    try {
      const newImageUrl = await editGeneratedImage(imageToEdit.url, editPrompt);
      
      const newImage: GeneratedImage = {
        id: uuidv4(),
        url: newImageUrl,
        prompt: `${imageToEdit.basePrompt} (Edited: ${editPrompt})`,
        basePrompt: imageToEdit.basePrompt,
        timestamp: Date.now()
      };

      // Add to gallery (top)
      setGeneratedImages(prev => [newImage, ...prev]);
      addLog("Image edited successfully.", 'success');
      setEditingImage(null); // Close modal
    } catch (error) {
      addLog(`Failed to edit image: ${error instanceof Error ? error.message : "Unknown error"}`, 'error');
    } finally {
      setStatus(AppStatus.IDLE);
    }
  };

  // Calculate current prompts count
  const promptCount = bulkPrompts.split('\n').filter(l => l.trim().length > 0).length;

  if (checkingKey) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full text-center space-y-6">
          <div className="flex justify-center mb-4">
             <div className="w-16 h-16 bg-yellow-500 rounded-xl flex items-center justify-center text-black font-bold text-3xl shadow-lg shadow-yellow-500/20">
              AB
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Welcome to <span className="text-yellow-400">AdsBro</span></h1>
          <p className="text-gray-400">
            To start generating consistent character images with the Bulk Generator, please connect your Google Cloud Project API Key.
          </p>
          
          <div className="space-y-3">
            <button 
              onClick={handleConnectApiKey}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-4 px-6 rounded-lg transition-all transform hover:scale-105 shadow-xl flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Connect API Key (AI Studio)
            </button>

            <button 
              onClick={() => setShowManualKeyModal(true)}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-all border border-gray-600 flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Enter Key Manually
            </button>
          </div>

          <p className="text-xs text-gray-500 pt-4 border-t border-gray-700">
            By connecting, you agree to the usage terms. 
            <br/>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-yellow-500 hover:underline mt-2 inline-block"
            >
              View Billing & API Documentation
            </a>
          </p>
        </div>

        <ApiKeyModal 
          isOpen={showManualKeyModal}
          onClose={() => setShowManualKeyModal(false)}
          onSuccess={handleManualKeySuccess}
        />
      </div>
    );
  }

  // Button Content Logic (Safe handling to avoid build errors)
  const renderButtonContent = () => {
    if (status === AppStatus.GENERATING) {
      if (cooldownTimer > 0) {
        return <span className="text-red-900 animate-pulse font-bold">Cooldown: {cooldownTimer}s</span>;
      }
      return (
        <>
          <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing...
        </>
      );
    }
    return <>🚀 Generate Bulk</>;
  };

  return (
    <div className="min-h-screen pb-20">
      
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center text-black font-bold text-xl shadow-lg shadow-yellow-500/20">
              AB
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              <span className="text-yellow-400">AdsBro</span> Bulk Image Generator
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500 font-mono hidden sm:block">
              Powered by Gemini 2.5 Flash Image
            </div>
            
            <button 
               onClick={handleRemoveKey}
               className="text-xs bg-gray-700 hover:bg-red-900 hover:text-white hover:border-red-800 text-gray-300 px-3 py-1 rounded border border-gray-600 transition-colors flex items-center gap-1"
               title="Disconnect API Key"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Controls */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Section 1: Character DNA */}
          <section className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
            <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500 text-black text-xs font-bold">1</span>
                Character DNA Reference
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Image Upload */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Upload Character Reference</label>
                <div className="relative group">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                    className="hidden" 
                    id="char-upload"
                  />
                  <label 
                    htmlFor="char-upload" 
                    className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                      ${charImage ? 'border-yellow-500 bg-gray-900' : 'border-gray-600 bg-gray-900/50 hover:bg-gray-800 hover:border-gray-500'}
                    `}
                  >
                    {charImage ? (
                      <img src={charImage} alt="Ref" className="h-full w-full object-contain rounded-lg p-1" />
                    ) : (
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-4 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        <p className="text-sm text-gray-500">Click to upload (PNG/JPG)</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Character Name */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Character Name</label>
                <input 
                  type="text"
                  value={charName}
                  onChange={(e) => setCharName(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block p-2.5"
                  placeholder="e.g. Cyber Samurai"
                />
              </div>

              {/* Analyze Button */}
              <button
                onClick={handleAnalyze}
                disabled={status !== AppStatus.IDLE || !charImage}
                className={`w-full text-black font-bold rounded-lg text-sm px-5 py-2.5 text-center transition-all
                  ${status !== AppStatus.IDLE || !charImage 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-yellow-500 hover:bg-yellow-400 shadow-lg shadow-yellow-500/20'}
                `}
              >
                {status === AppStatus.ANALYZING ? 'Analyzing DNA...' : 'Analyze & Extract DNA'}
              </button>

              {/* Read Only DNA */}
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-1">DNA PROMPT (READ-ONLY)</label>
                <textarea 
                  readOnly 
                  value={dnaPrompt}
                  className="block p-2.5 w-full text-xs text-gray-300 bg-gray-900 rounded-lg border border-gray-700 focus:ring-0 focus:border-gray-600 h-24 resize-none font-mono"
                  placeholder="Analysis result will appear here..."
                ></textarea>
              </div>
            </div>
          </section>

          {/* Section 2: Bulk Prompt */}
          <section className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
             <div className="bg-gray-900 px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500 text-black text-xs font-bold">2</span>
                Bulk Prompt Editor
              </h2>
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${promptCount > MAX_PROMPTS ? 'bg-red-900 text-red-200' : 'bg-gray-800 text-gray-400'}`}>
                {promptCount} / {MAX_PROMPTS}
              </span>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Global Style (Editable)</label>
                <input 
                  type="text"
                  value={globalStyle}
                  onChange={(e) => setGlobalStyle(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block p-2.5"
                  placeholder="e.g. Studio Ghibli, Cinematic, 3D Render"
                />
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Prompts (One Scene per line)</label>
                 <textarea
                  value={bulkPrompts}
                  onChange={(e) => setBulkPrompts(e.target.value)}
                  rows={8}
                  className="block p-2.5 w-full text-sm text-white bg-gray-900 rounded-lg border border-gray-600 focus:ring-yellow-500 focus:border-yellow-500 font-mono"
                  placeholder="sitting at a cafe laughing&#10;walking in a rainy neon street&#10;fighting a giant robot"
                 ></textarea>
                 <div className="flex justify-between mt-2 items-center">
                   <p className={`text-xs ${promptCount > MAX_PROMPTS ? 'text-red-400' : 'text-gray-500'}`}>
                     Max {MAX_PROMPTS} prompts
                   </p>
                   
                   {/* SAFE MODE TOGGLE */}
                   <label className="inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={safeMode} 
                        onChange={(e) => setSafeMode(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="relative w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                      <span className="ms-2 text-xs font-medium text-gray-400">Safe Mode (Free Tier)</span>
                  </label>
                 </div>
              </div>
            </div>
          </section>

          {/* Section 3: Action & Logs */}
          <section className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl sticky top-24">
             <div className="p-6 space-y-4">
                <button
                  onClick={handleBulkGenerate}
                  disabled={status !== AppStatus.IDLE || !bulkPrompts.trim()}
                  className={`w-full text-black font-bold rounded-lg text-lg px-5 py-4 text-center flex items-center justify-center gap-2 transition-transform active:scale-95
                    ${status !== AppStatus.IDLE || !bulkPrompts.trim()
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 shadow-xl shadow-yellow-500/20'}
                  `}
                >
                  {renderButtonContent()}
                </button>

                {/* Progress Bar */}
                {status === AppStatus.GENERATING && (
                  <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div className="bg-yellow-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                  </div>
                )}

                {/* Logs Console */}
                <div className="bg-black rounded-lg border border-gray-700 p-3 h-48 overflow-y-auto font-mono text-xs">
                  {logs.length === 0 && <span className="text-gray-600">System ready. Waiting for input...</span>}
                  {logs.map((log) => (
                    <div key={log.id} className="mb-1">
                      <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                      <span className={
                        log.type === 'error' ? 'text-red-400' : 
                        log.type === 'success' ? 'text-green-400' : 'text-blue-300'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
             </div>
          </section>

        </div>

        {/* RIGHT COLUMN: Gallery */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Generated Assets</h2>
            <span className="bg-gray-800 text-yellow-500 text-xs font-mono px-3 py-1 rounded-full border border-gray-700">
              {generatedImages.length} ITEMS
            </span>
          </div>

          {generatedImages.length === 0 ? (
            <div className="border-2 border-dashed border-gray-700 rounded-xl h-96 flex flex-col items-center justify-center text-gray-500 bg-gray-800/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>Generated images will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {generatedImages.map((img) => (
                <div key={img.id} className="group bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-yellow-500 transition-colors shadow-lg">
                  <div className="relative aspect-square bg-gray-900 overflow-hidden">
                    <img src={img.url} alt={img.prompt} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    
                    {/* Overlay Actions */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 p-4">
                      <a 
                        href={img.url} 
                        download={`character-${img.id}.png`}
                        className="bg-white text-black font-bold py-2 px-6 rounded-full hover:bg-gray-200 transform hover:scale-105 transition-all text-sm flex items-center gap-2"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </a>
                      
                      <button 
                        onClick={() => setEditingImage(img)}
                        className="bg-yellow-500 text-black font-bold py-2 px-6 rounded-full hover:bg-yellow-400 transform hover:scale-105 transition-all text-sm flex items-center gap-2"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Smart Edit
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-gray-300 font-medium line-clamp-2" title={img.prompt}>
                      {img.prompt}
                    </p>
                    <div className="flex justify-between items-center mt-3">
                       <span className="text-xs text-gray-500 font-mono">
                         {new Date(img.timestamp).toLocaleTimeString()}
                       </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Editor Modal */}
      {editingImage && (
        <EditorModal 
          image={editingImage} 
          isOpen={!!editingImage}
          onClose={() => setEditingImage(null)}
          onConfirmEdit={handleSmartEdit}
          isProcessing={status === AppStatus.EDITING}
        />
      )}

    </div>
  );
};

export default App;