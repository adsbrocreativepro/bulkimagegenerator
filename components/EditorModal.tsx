import React, { useState } from 'react';
import { GeneratedImage } from '../types';

interface EditorModalProps {
  image: GeneratedImage;
  isOpen: boolean;
  onClose: () => void;
  onConfirmEdit: (imageId: string, prompt: string) => Promise<void>;
  isProcessing: boolean;
}

const EditorModal: React.FC<EditorModalProps> = ({ image, isOpen, onClose, onConfirmEdit, isProcessing }) => {
  const [prompt, setPrompt] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (prompt.trim()) {
      onConfirmEdit(image.id, prompt);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
      <div className="bg-gray-800 border border-yellow-500/30 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-yellow-400 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Smart Edit
          </h3>
          <button onClick={onClose} disabled={isProcessing} className="text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col md:flex-row gap-6">
          {/* Image Preview */}
          <div className="flex-1 flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700 p-2">
            <img src={image.url} alt="To Edit" className="max-h-64 object-contain rounded" />
          </div>

          {/* Controls */}
          <div className="flex-1 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Edit Instruction
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g., "Add a retro filter", "Make it rain", "Remove the background"'
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none h-32"
                disabled={isProcessing}
              />
            </div>
            
            <div className="mt-auto">
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isProcessing}
                className={`w-full py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all
                  ${!prompt.trim() || isProcessing 
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                    : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg shadow-yellow-500/20'
                  }`}
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    Apply Edit
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorModal;