'use client';

import { useState, useEffect } from 'react';

declare global {
  interface Window {
    cv: any;
    onOpenCvReady: () => void;
  }
}

export const useOpenCv = () => {
  const [cv, setCv] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const loadOpenCv = async () => {
      console.log("loadOpenCv: Starting...");
      if (window.cv) {
        console.log("loadOpenCv: OpenCV already available.");
        setCv(window.cv);
        setIsLoaded(true);
        setProgress(100);
        return;
      }

      console.log("loadOpenCv: Fetching /api/opencv...");
      const response = await fetch('/api/opencv');
      console.log(`loadOpenCv: Fetch response status: ${response.status}, ok: ${response.ok}`);

      if (!response.ok) {
        console.error("loadOpenCv: Failed to fetch OpenCV.js from proxy.", response);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error("loadOpenCv: Failed to get reader from response body.");
        return;
      }

      const contentLength = +(response.headers.get('Content-Length') || 0);
      console.log(`loadOpenCv: Content-Length: ${contentLength}`);
      let receivedLength = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        const currentProgress = Math.round((receivedLength / contentLength) * 100);
        setProgress(currentProgress);
        console.log(`loadOpenCv: Download progress: ${currentProgress}%`);
      }

      const blob = new Blob(chunks);
      const script = document.createElement('script');
      script.src = URL.createObjectURL(blob);
      script.async = true;

      window.Module = {
        onRuntimeInitialized: () => {
          console.log("loadOpenCv: onRuntimeInitialized called.");
          setCv(window.cv);
          setIsLoaded(true);
        },
      };

      document.body.appendChild(script);
      console.log("loadOpenCv: Script appended to body.");
    };

    loadOpenCv();
  }, []);

  return { cv, isLoaded, progress };
};