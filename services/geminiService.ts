import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { AnalysisResponse } from "../types";

// Key used for localStorage
export const STORAGE_KEY = 'ADS_BRO_GEMINI_KEY';

// NSFW Blacklist (Basic filter to save API calls)
const PROMPT_BLACKLIST = [
  'nude', 'naked', 'sex', 'porn', 'nsfw', 'undressed', 'lingerie', 
  'erotic', 'topless', 'exposed', 'breast', 'genital', 'xxx'
];

// Helper to get API Key from either LocalStorage or Env
const getApiKey = (): string => {
  const localKey = localStorage.getItem(STORAGE_KEY);
  if (localKey) return localKey;
  
  // Fallback to AI Studio injected key if available
  return process.env.API_KEY || "";
};

// Helper to remove data URL prefix
const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
};

const getMimeType = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,/);
  return match ? match[1] : 'image/png';
};

// Helper: Validate Prompt Safety (Client Side)
const validatePromptSafety = (prompt: string) => {
  const lowerPrompt = prompt.toLowerCase();
  const foundWord = PROMPT_BLACKLIST.find(word => lowerPrompt.includes(word));
  if (foundWord) {
    throw new Error(`Safety Violation: The word "${foundWord}" is not allowed.`);
  }
};

// Helper: Extract wait time from error message
const extractWaitTime = (errorMessage: string): number => {
  // Regex to find "retry in 56.35s" or similar
  const match = errorMessage.match(/retry in ([0-9.]+)s/);
  if (match && match[1]) {
    // Add generous 10s buffer to ensure we don't hit it again immediately
    return Math.ceil(parseFloat(match[1])) * 1000 + 10000; 
  }
  return 0;
};

// Helper: Retry Operation with Smart Backoff
// REDUCED RETRIES: Don't hammer the API in background. Fail fast so UI can handle delays.
const retryOperation = async <T>(operation: () => Promise<T>, maxRetries = 1): Promise<T> => {
  let lastError: any;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errMsg = error.message || JSON.stringify(error);

      // Check for Safety/Refusal - Do NOT retry these
      if (errMsg.includes("Safety") || errMsg.includes("Refusal") || errMsg.includes("Violation")) {
        throw error;
      }
      
      // Check for 403 (Billing/Permission) - Do NOT retry, throw SPECIFIC error
      if (error.status === 403 || errMsg.includes("403") || errMsg.includes("PERMISSION_DENIED")) {
         throw new Error("Permission Denied (403). For Image Generation, you MUST have Billing enabled in Google Cloud Project, or check your API Key domain restrictions.");
      }

      // Check for 429 (Rate Limit) OR 503 (Overloaded) - RETRY THESE
      const isRateLimit = error.status === 429 || errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED");
      
      if (isRateLimit || error.status >= 500) {
        if (i === maxRetries) break; // Give up after max retries

        // Determine wait time
        let waitTime = extractWaitTime(errMsg);
        
        // If no specific time in error, use aggressive exponential backoff
        if (waitTime === 0) {
          // Increase base wait time: 5s, 10s...
          waitTime = (Math.pow(2, i + 2)) * 1000 + 5000; 
        }

        console.warn(`Attempt ${i + 1} failed (Rate Limit). Waiting ${waitTime/1000}s before retrying...`);
        
        // Block processing
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Other 4xx errors - throw immediately
      throw error;
    }
  }
  
  // Clean up error message before throwing final error
  const finalMsg = lastError.message || JSON.stringify(lastError);
  if (finalMsg.includes("quota") || finalMsg.includes("429")) {
    throw new Error("Rate limit exceeded (Quota Full).");
  }
  throw lastError;
};

/**
 * Analyzes a character image to extract physical description and art style.
 * Uses gemini-2.5-flash for fast vision analysis.
 */
export const analyzeCharacterImage = async (base64Image: string): Promise<AnalysisResponse> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing. Please connect your API key first.");

  const ai = new GoogleGenAI({ apiKey });

  // Tweak: Ask for "Digital Art" description to avoid "Real Person" refusal in later generation
  const prompt = `
    Analyze this character image for the purpose of creating consistent digital art.
    
    1. 'dna': Describe the character as a fictional design. Focus on physical features (face, hair, body), clothing, and colors. Avoid using real people's names.
    2. 'style': Describe the visual art style (e.g. 3D render, digital painting, cel shaded, photorealistic CGI).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: getMimeType(base64Image),
              data: cleanBase64(base64Image)
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dna: { type: Type.STRING },
            style: { type: Type.STRING }
          },
          required: ["dna", "style"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from analysis model");
    
    return JSON.parse(text) as AnalysisResponse;

  } catch (error) {
    console.error("Analysis Error:", error);
    throw new Error("Failed to analyze character image.");
  }
};

/**
 * Generates an image using Gemini 2.5 Flash Image (Nano Banana).
 */
export const generateCharacterImage = async (finalPrompt: string): Promise<string> => {
  validatePromptSafety(finalPrompt);

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });

  const operation = async () => {
    try {
      // Log prompt for debugging
      console.log("Generating with prompt:", finalPrompt);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: finalPrompt }]
        },
        config: {
          // DOUBLE PROTECTION: 
          // 1. Strict blocking for Sexually Explicit content
          // 2. Permissive for others (Violence/Harassment) to allow Action scenes
          // FIXED: Using Enums for Type Safety
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }, // STRICT
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          ]
        }
      });

      let base64Image = '';
      let refusalText = '';
      
      for (const candidate of response.candidates || []) {
        // Check for finish reason first
        if (candidate.finishReason === 'SAFETY') {
          throw new Error("Generation blocked by Safety Filters (Content flagged).");
        }
        
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            base64Image = part.inlineData.data;
          } else if (part.text) {
            refusalText += part.text;
          }
        }
      }

      if (!base64Image) {
        if (refusalText) {
          // Common refusals: "I cannot generate images of real people", "I cannot create this content"
          throw new Error(`Model Refusal: ${refusalText.substring(0, 150)}...`);
        }
        throw new Error("No image generated.");
      }

      return `data:image/png;base64,${base64Image}`;

    } catch (error: any) {
      // Pass raw error to retryOperation to handle status codes
      throw error; 
    }
  };

  // REDUCED RETRIES: Only 1 retry to avoid long timeouts. Let the UI handle 60s waits.
  return retryOperation(operation, 1);
};

/**
 * Edits an existing image using text instructions.
 */
export const editGeneratedImage = async (originalImageBase64: string, editInstruction: string): Promise<string> => {
  validatePromptSafety(editInstruction);

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });

  const operation = async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: getMimeType(originalImageBase64),
              data: cleanBase64(originalImageBase64)
            }
          },
          { text: editInstruction }
        ]
      },
      config: {
        // FIXED: Using Enums for Type Safety
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }, // STRICT
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ]
      }
    });

    let base64Image = '';
    
    for (const candidate of response.candidates || []) {
      if (candidate.finishReason === 'SAFETY') throw new Error("Edit blocked by Safety Filters.");
      
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          base64Image = part.inlineData.data;
        }
      }
    }

    if (!base64Image) throw new Error("Failed to edit image (No output).");
    return `data:image/png;base64,${base64Image}`;
  };

  return retryOperation(operation, 1);
};
