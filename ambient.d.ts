// File ini untuk memberitahu TypeScript bahwa 'window.aistudio' itu ada.

interface AdsBroApi {
    // Fungsi yang dipanggil di lingkungan desktop
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
    openExternalLink: (url: string) => void;
}

interface Window {
    // Memberi tipe ke window.adsbro dan window.aistudio
    adsbro?: AdsBroApi;
    aistudio?: AdsBroApi;
}