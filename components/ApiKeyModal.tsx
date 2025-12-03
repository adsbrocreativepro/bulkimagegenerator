import React, { useState } from 'react';
import { STORAGE_KEY } from '../services/geminiService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [key, setKey] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
      <div className="bg-gray-800 border border-yellow-500/30 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-6">
          <h3 className="text-xl font-bold text-white mb-2">Enter Gemini API Key</h3>
          <p className="text-sm text-gray-400 mb-6">
            Your key will be stored locally in your browser.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">
                API Key
              </label>
              <input 
                type="password" 
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none font-mono text-sm"
              />
            </div>

            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 space-y-2">
               <div>
                  <p className="text-xs text-gray-500">
                    Need a key? Get one for free at Google AI Studio:
                  </p>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-yellow-500 text-xs hover:underline flex items-center gap-1 mt-1 font-medium"
                  >
                    Get API Key
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
               </div>
               
               {/* Netlify/Deployment Warning */}
               <div className="pt-2 border-t border-gray-700">
                 <p className="text-[10px] text-gray-400 leading-tight">
                   <strong className="text-yellow-500">Deploying to Netlify/Vercel?</strong>
                   <br/>
                   If you get "403 Forbidden" errors, check your API Key restrictions in Google Cloud Console. 
                   Ensure your site domain (e.g. <span className="font-mono text-gray-500">yoursite.netlify.app</span>) is added to "HTTP Referrers".
                 </p>
               </div>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!key.trim()}
              className={`flex-1 px-4 py-2 rounded-lg font-bold text-black transition-all
                ${!key.trim() ? 'bg-gray-600 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-400 shadow-lg shadow-yellow-500/20'}
              `}
            >
              Save Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;