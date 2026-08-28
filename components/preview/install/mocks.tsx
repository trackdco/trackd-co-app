"use client";

/**
 * Drawn recreations of the phone surfaces the install screens have to talk
 * about: the iPhone Home Screen, Samsung's One UI launcher and the Pixel
 * launcher.
 *
 * DEV PREVIEW ONLY (`/preview/install`). These are RECREATIONS built to
 * measured specs, not anyone's artwork — a tile is a colour, a gradient and
 * a simple glyph, recognisable at 52px and ours to ship.
 *
 * See `install-mocks.css` for why the metrics live in plain CSS.
 */
import { createContext, useContext } from "react";

import Image from "next/image";

import { cn } from "@/lib/utils";

import "./install-mocks.css";

/* ---------------------------------------------------------------- icons */

/**
 * `full` art fills the whole tile and carries its own background, which is
 * what Apple's icons actually are. The older entries are a small glyph on a
 * flat `bg` and keep their reduced scale until they are replaced.
 */
type Art = { bg: string; svg: React.ReactNode; full?: boolean; raw?: string };

export const APP_ART: Record<string, Art> = {
  messages: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_messages-bg" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#5DF173"/><stop offset="0.5" stop-color="#3AD656"/><stop offset="1" stop-color="#25BD3D"/>
</linearGradient>
<linearGradient id="ios_messages-rim" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.55" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0.56"/>
</linearGradient>
<linearGradient id="ios_messages-glass" x1="0" y1="17.95" x2="0" y2="79.4" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff"/><stop offset="0.20" stop-color="#fcfefb"/><stop offset="0.32" stop-color="#f4fbf3"/><stop offset="0.44" stop-color="#e7f8ea"/><stop offset="0.55" stop-color="#daf5de"/><stop offset="0.68" stop-color="#c2eeca"/><stop offset="0.80" stop-color="#b1eabb"/><stop offset="0.92" stop-color="#a0e5ad"/><stop offset="1" stop-color="#9ae3a7"/>
</linearGradient>
<linearGradient id="ios_messages-edge" x1="0" y1="17.95" x2="0" y2="79.4" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.08"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.14"/><stop offset="0.78" stop-color="#fff" stop-opacity="0.24"/><stop offset="1" stop-color="#fff" stop-opacity="0.34"/>
</linearGradient>
<filter id="ios_messages-b1" x="-25" y="-25" width="150" height="150" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2.6"/></filter>
<filter id="ios_messages-b2" x="-25" y="-25" width="150" height="150" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="0.4"/></filter>
<filter id="ios_messages-b3" x="-25" y="-25" width="150" height="150" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1.15"/></filter>
<filter id="ios_messages-b4" x="-25" y="-25" width="150" height="150" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="0.75"/></filter>
<filter id="ios_messages-b5" x="-25" y="-25" width="150" height="150" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="4.5"/></filter>
<clipPath id="ios_messages-box"><rect x="0" y="0" width="100" height="100"/></clipPath>
<path id="ios_messages-bub" d="M50 17.95C70.6 17.95 86.6 31.4 86.6 48.05C86.6 64.9 70.6 78.3 50 78.3C42.8 78.3 35.0 77.2 29.6 73.95C26.2 76.25 22.0 78.7 18.9 79.35C17.6 79.6 16.9 79.0 17.3 77.8C18.1 75.5 20.0 73.1 21.2 70.3C18.6 65.2 13.4 57.6 13.4 48.05C13.4 31.4 29.4 17.95 50 17.95Z"/>
<clipPath id="ios_messages-bubclip"><use href="#ios_messages-bub"/></clipPath>
</defs>

<rect width="100" height="100" fill="url(#ios_messages-bg)"/>

<g clip-path="url(#ios_messages-box)">
  <g transform="translate(0,3.0)" opacity="0.14" filter="url(#ios_messages-b1)"><use href="#ios_messages-bub" fill="#00A526"/></g>
  <g transform="translate(0,1.4)" opacity="0.16" filter="url(#ios_messages-b3)"><use href="#ios_messages-bub" fill="#00A526"/></g>

  <use href="#ios_messages-bub" fill="url(#ios_messages-glass)"/>

  <g clip-path="url(#ios_messages-bubclip)">
    <ellipse cx="37" cy="33" rx="27" ry="15" transform="rotate(-16 37 33)" fill="#fff" opacity="0.22" filter="url(#ios_messages-b5)"/>
    <use href="#ios_messages-bub" fill="none" stroke="url(#ios_messages-edge)" stroke-width="3.2" filter="url(#ios_messages-b4)"/>
  </g>

  <g filter="url(#ios_messages-b2)">
    <rect x="0.4" y="0.4" width="99.2" height="99.2" fill="none" stroke="url(#ios_messages-rim)" stroke-width="0.8"/>
    <rect x="1.4" y="1.4" width="97.2" height="97.2" fill="none" stroke="url(#ios_messages-rim)" stroke-width="1.2" opacity="0.26"/>
  </g>
</g>
</svg>`,
    svg: null,
  },
  phone: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_phone-bg" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#59F171"/><stop offset="0.5" stop-color="#3CD858"/><stop offset="1" stop-color="#27C040"/>
</linearGradient>
<linearGradient id="ios_phone-rt" x1="0" y1="0" x2="0" y2="2.2" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.48"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_phone-rl" x1="0" y1="0" x2="2.2" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.27"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.11"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_phone-rb" x1="0" y1="97.8" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.03"/><stop offset="1" stop-color="#fff" stop-opacity="0.11"/>
</linearGradient>
<linearGradient id="ios_phone-rr" x1="97.8" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.035"/><stop offset="1" stop-color="#fff" stop-opacity="0.12"/>
</linearGradient>
<linearGradient id="ios_phone-glass" x1="0" y1="18" x2="0" y2="82" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFFFFF"/>
<stop offset="0.07" stop-color="#FEFFFE"/>
<stop offset="0.21" stop-color="#FAFEFB"/>
<stop offset="0.33" stop-color="#F2FFF5"/>
<stop offset="0.48" stop-color="#E6FEEB"/>
<stop offset="0.59" stop-color="#D6F8DB"/>
<stop offset="0.73" stop-color="#C3F1CB"/>
<stop offset="0.85" stop-color="#AAE6B4"/>
<stop offset="1" stop-color="#9AE4A8"/>
</linearGradient>
<radialGradient id="ios_phone-tint" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(54 76.5) rotate(35) scale(13 9.5)">
<stop offset="0" stop-color="#80F793" stop-opacity="0.26"/><stop offset="0.6" stop-color="#80F793" stop-opacity="0.15"/><stop offset="1" stop-color="#80F793" stop-opacity="0"/>
</radialGradient>
<radialGradient id="ios_phone-spec" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(26.5 28.5) rotate(52) scale(16 11)">
<stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<filter id="ios_phone-b1" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="0.7"/></filter>
<filter id="ios_phone-b2" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="0.45"/></filter>
<filter id="ios_phone-b3" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="ios_phone-shA" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2.6"/></filter>
<filter id="ios_phone-shB" x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="1.1"/></filter>
<clipPath id="ios_phone-clip"><path d="M 26.37 18.51 C 27.34 18.36 28.55 18.46 29.39 18.91 C 30.24 19.37 30.83 20.41 31.45 21.25 C 32.07 22.08 32.56 23.02 33.11 23.90 C 33.67 24.79 34.21 25.68 34.77 26.57 C 35.32 27.45 35.89 28.33 36.43 29.22 C 36.98 30.11 37.66 30.97 38.03 31.92 C 38.39 32.88 38.69 33.95 38.61 34.95 C 38.53 35.94 37.96 36.92 37.55 37.88 C 37.14 38.83 36.53 39.72 36.14 40.68 C 35.75 41.64 35.23 42.65 35.22 43.64 C 35.20 44.63 35.58 45.71 36.04 46.63 C 36.49 47.54 37.28 48.30 37.94 49.12 C 38.59 49.93 39.28 50.72 39.97 51.50 C 40.66 52.28 41.37 53.05 42.09 53.81 C 42.81 54.57 43.55 55.31 44.29 56.04 C 45.03 56.78 45.77 57.52 46.54 58.24 C 47.30 58.95 48.09 59.63 48.88 60.31 C 49.68 61.00 50.45 61.70 51.28 62.33 C 52.11 62.96 52.92 63.75 53.86 64.11 C 54.79 64.47 55.91 64.63 56.90 64.50 C 57.90 64.36 58.85 63.74 59.80 63.31 C 60.75 62.88 61.63 62.26 62.60 61.90 C 63.56 61.54 64.62 61.12 65.61 61.16 C 66.60 61.20 67.62 61.70 68.55 62.14 C 69.49 62.58 70.32 63.25 71.21 63.80 C 72.10 64.35 73.00 64.89 73.88 65.43 C 74.77 65.98 75.66 66.54 76.54 67.10 C 77.42 67.66 78.39 68.13 79.17 68.80 C 79.95 69.47 80.91 70.21 81.22 71.10 C 81.54 72.00 81.33 73.20 81.06 74.17 C 80.78 75.14 80.18 76.09 79.57 76.93 C 78.97 77.76 78.24 78.56 77.43 79.20 C 76.62 79.83 75.68 80.36 74.72 80.74 C 73.75 81.11 72.70 81.32 71.67 81.45 C 70.64 81.57 69.58 81.56 68.54 81.47 C 67.51 81.39 66.47 81.17 65.46 80.94 C 64.44 80.71 63.44 80.41 62.45 80.07 C 61.46 79.74 60.48 79.35 59.53 78.93 C 58.57 78.51 57.64 78.04 56.71 77.56 C 55.78 77.08 54.86 76.58 53.96 76.05 C 53.06 75.52 52.18 74.96 51.30 74.39 C 50.43 73.82 49.55 73.25 48.70 72.64 C 47.86 72.03 47.04 71.37 46.22 70.73 C 45.40 70.08 44.57 69.44 43.76 68.78 C 42.96 68.11 42.18 67.42 41.39 66.73 C 40.61 66.03 39.82 65.35 39.06 64.63 C 38.30 63.91 37.57 63.17 36.84 62.42 C 36.10 61.68 35.37 60.93 34.66 60.17 C 33.94 59.40 33.23 58.64 32.54 57.85 C 31.86 57.06 31.20 56.25 30.54 55.44 C 29.88 54.63 29.22 53.82 28.59 52.99 C 27.95 52.16 27.34 51.31 26.74 50.45 C 26.15 49.59 25.56 48.73 25.00 47.85 C 24.44 46.97 23.89 46.07 23.38 45.17 C 22.86 44.26 22.37 43.34 21.90 42.40 C 21.43 41.47 20.98 40.52 20.58 39.56 C 20.18 38.60 19.80 37.62 19.49 36.62 C 19.17 35.63 18.89 34.61 18.70 33.59 C 18.52 32.57 18.40 31.52 18.36 30.48 C 18.32 29.44 18.28 28.37 18.45 27.35 C 18.61 26.33 18.91 25.29 19.35 24.36 C 19.79 23.43 20.40 22.53 21.10 21.77 C 21.79 21.01 22.65 20.35 23.53 19.81 C 24.41 19.26 25.39 18.66 26.37 18.51 Z"/></clipPath>
</defs>
<rect width="100" height="100" fill="url(#ios_phone-bg)"/>
<rect width="100" height="2.2" fill="url(#ios_phone-rt)"/>
<rect width="2.2" height="100" fill="url(#ios_phone-rl)"/>
<rect y="97.8" width="100" height="2.2" fill="url(#ios_phone-rb)"/>
<rect x="97.8" width="2.2" height="100" fill="url(#ios_phone-rr)"/>
<path d="M 26.37 18.51 C 27.34 18.36 28.55 18.46 29.39 18.91 C 30.24 19.37 30.83 20.41 31.45 21.25 C 32.07 22.08 32.56 23.02 33.11 23.90 C 33.67 24.79 34.21 25.68 34.77 26.57 C 35.32 27.45 35.89 28.33 36.43 29.22 C 36.98 30.11 37.66 30.97 38.03 31.92 C 38.39 32.88 38.69 33.95 38.61 34.95 C 38.53 35.94 37.96 36.92 37.55 37.88 C 37.14 38.83 36.53 39.72 36.14 40.68 C 35.75 41.64 35.23 42.65 35.22 43.64 C 35.20 44.63 35.58 45.71 36.04 46.63 C 36.49 47.54 37.28 48.30 37.94 49.12 C 38.59 49.93 39.28 50.72 39.97 51.50 C 40.66 52.28 41.37 53.05 42.09 53.81 C 42.81 54.57 43.55 55.31 44.29 56.04 C 45.03 56.78 45.77 57.52 46.54 58.24 C 47.30 58.95 48.09 59.63 48.88 60.31 C 49.68 61.00 50.45 61.70 51.28 62.33 C 52.11 62.96 52.92 63.75 53.86 64.11 C 54.79 64.47 55.91 64.63 56.90 64.50 C 57.90 64.36 58.85 63.74 59.80 63.31 C 60.75 62.88 61.63 62.26 62.60 61.90 C 63.56 61.54 64.62 61.12 65.61 61.16 C 66.60 61.20 67.62 61.70 68.55 62.14 C 69.49 62.58 70.32 63.25 71.21 63.80 C 72.10 64.35 73.00 64.89 73.88 65.43 C 74.77 65.98 75.66 66.54 76.54 67.10 C 77.42 67.66 78.39 68.13 79.17 68.80 C 79.95 69.47 80.91 70.21 81.22 71.10 C 81.54 72.00 81.33 73.20 81.06 74.17 C 80.78 75.14 80.18 76.09 79.57 76.93 C 78.97 77.76 78.24 78.56 77.43 79.20 C 76.62 79.83 75.68 80.36 74.72 80.74 C 73.75 81.11 72.70 81.32 71.67 81.45 C 70.64 81.57 69.58 81.56 68.54 81.47 C 67.51 81.39 66.47 81.17 65.46 80.94 C 64.44 80.71 63.44 80.41 62.45 80.07 C 61.46 79.74 60.48 79.35 59.53 78.93 C 58.57 78.51 57.64 78.04 56.71 77.56 C 55.78 77.08 54.86 76.58 53.96 76.05 C 53.06 75.52 52.18 74.96 51.30 74.39 C 50.43 73.82 49.55 73.25 48.70 72.64 C 47.86 72.03 47.04 71.37 46.22 70.73 C 45.40 70.08 44.57 69.44 43.76 68.78 C 42.96 68.11 42.18 67.42 41.39 66.73 C 40.61 66.03 39.82 65.35 39.06 64.63 C 38.30 63.91 37.57 63.17 36.84 62.42 C 36.10 61.68 35.37 60.93 34.66 60.17 C 33.94 59.40 33.23 58.64 32.54 57.85 C 31.86 57.06 31.20 56.25 30.54 55.44 C 29.88 54.63 29.22 53.82 28.59 52.99 C 27.95 52.16 27.34 51.31 26.74 50.45 C 26.15 49.59 25.56 48.73 25.00 47.85 C 24.44 46.97 23.89 46.07 23.38 45.17 C 22.86 44.26 22.37 43.34 21.90 42.40 C 21.43 41.47 20.98 40.52 20.58 39.56 C 20.18 38.60 19.80 37.62 19.49 36.62 C 19.17 35.63 18.89 34.61 18.70 33.59 C 18.52 32.57 18.40 31.52 18.36 30.48 C 18.32 29.44 18.28 28.37 18.45 27.35 C 18.61 26.33 18.91 25.29 19.35 24.36 C 19.79 23.43 20.40 22.53 21.10 21.77 C 21.79 21.01 22.65 20.35 23.53 19.81 C 24.41 19.26 25.39 18.66 26.37 18.51 Z" transform="translate(0.5 2.0)" fill="#00330A" opacity="0.15" filter="url(#ios_phone-shA)"/>
<path d="M 26.37 18.51 C 27.34 18.36 28.55 18.46 29.39 18.91 C 30.24 19.37 30.83 20.41 31.45 21.25 C 32.07 22.08 32.56 23.02 33.11 23.90 C 33.67 24.79 34.21 25.68 34.77 26.57 C 35.32 27.45 35.89 28.33 36.43 29.22 C 36.98 30.11 37.66 30.97 38.03 31.92 C 38.39 32.88 38.69 33.95 38.61 34.95 C 38.53 35.94 37.96 36.92 37.55 37.88 C 37.14 38.83 36.53 39.72 36.14 40.68 C 35.75 41.64 35.23 42.65 35.22 43.64 C 35.20 44.63 35.58 45.71 36.04 46.63 C 36.49 47.54 37.28 48.30 37.94 49.12 C 38.59 49.93 39.28 50.72 39.97 51.50 C 40.66 52.28 41.37 53.05 42.09 53.81 C 42.81 54.57 43.55 55.31 44.29 56.04 C 45.03 56.78 45.77 57.52 46.54 58.24 C 47.30 58.95 48.09 59.63 48.88 60.31 C 49.68 61.00 50.45 61.70 51.28 62.33 C 52.11 62.96 52.92 63.75 53.86 64.11 C 54.79 64.47 55.91 64.63 56.90 64.50 C 57.90 64.36 58.85 63.74 59.80 63.31 C 60.75 62.88 61.63 62.26 62.60 61.90 C 63.56 61.54 64.62 61.12 65.61 61.16 C 66.60 61.20 67.62 61.70 68.55 62.14 C 69.49 62.58 70.32 63.25 71.21 63.80 C 72.10 64.35 73.00 64.89 73.88 65.43 C 74.77 65.98 75.66 66.54 76.54 67.10 C 77.42 67.66 78.39 68.13 79.17 68.80 C 79.95 69.47 80.91 70.21 81.22 71.10 C 81.54 72.00 81.33 73.20 81.06 74.17 C 80.78 75.14 80.18 76.09 79.57 76.93 C 78.97 77.76 78.24 78.56 77.43 79.20 C 76.62 79.83 75.68 80.36 74.72 80.74 C 73.75 81.11 72.70 81.32 71.67 81.45 C 70.64 81.57 69.58 81.56 68.54 81.47 C 67.51 81.39 66.47 81.17 65.46 80.94 C 64.44 80.71 63.44 80.41 62.45 80.07 C 61.46 79.74 60.48 79.35 59.53 78.93 C 58.57 78.51 57.64 78.04 56.71 77.56 C 55.78 77.08 54.86 76.58 53.96 76.05 C 53.06 75.52 52.18 74.96 51.30 74.39 C 50.43 73.82 49.55 73.25 48.70 72.64 C 47.86 72.03 47.04 71.37 46.22 70.73 C 45.40 70.08 44.57 69.44 43.76 68.78 C 42.96 68.11 42.18 67.42 41.39 66.73 C 40.61 66.03 39.82 65.35 39.06 64.63 C 38.30 63.91 37.57 63.17 36.84 62.42 C 36.10 61.68 35.37 60.93 34.66 60.17 C 33.94 59.40 33.23 58.64 32.54 57.85 C 31.86 57.06 31.20 56.25 30.54 55.44 C 29.88 54.63 29.22 53.82 28.59 52.99 C 27.95 52.16 27.34 51.31 26.74 50.45 C 26.15 49.59 25.56 48.73 25.00 47.85 C 24.44 46.97 23.89 46.07 23.38 45.17 C 22.86 44.26 22.37 43.34 21.90 42.40 C 21.43 41.47 20.98 40.52 20.58 39.56 C 20.18 38.60 19.80 37.62 19.49 36.62 C 19.17 35.63 18.89 34.61 18.70 33.59 C 18.52 32.57 18.40 31.52 18.36 30.48 C 18.32 29.44 18.28 28.37 18.45 27.35 C 18.61 26.33 18.91 25.29 19.35 24.36 C 19.79 23.43 20.40 22.53 21.10 21.77 C 21.79 21.01 22.65 20.35 23.53 19.81 C 24.41 19.26 25.39 18.66 26.37 18.51 Z" transform="translate(0.3 0.7)" fill="#00330A" opacity="0.13" filter="url(#ios_phone-shB)"/>
<path d="M 26.37 18.51 C 27.34 18.36 28.55 18.46 29.39 18.91 C 30.24 19.37 30.83 20.41 31.45 21.25 C 32.07 22.08 32.56 23.02 33.11 23.90 C 33.67 24.79 34.21 25.68 34.77 26.57 C 35.32 27.45 35.89 28.33 36.43 29.22 C 36.98 30.11 37.66 30.97 38.03 31.92 C 38.39 32.88 38.69 33.95 38.61 34.95 C 38.53 35.94 37.96 36.92 37.55 37.88 C 37.14 38.83 36.53 39.72 36.14 40.68 C 35.75 41.64 35.23 42.65 35.22 43.64 C 35.20 44.63 35.58 45.71 36.04 46.63 C 36.49 47.54 37.28 48.30 37.94 49.12 C 38.59 49.93 39.28 50.72 39.97 51.50 C 40.66 52.28 41.37 53.05 42.09 53.81 C 42.81 54.57 43.55 55.31 44.29 56.04 C 45.03 56.78 45.77 57.52 46.54 58.24 C 47.30 58.95 48.09 59.63 48.88 60.31 C 49.68 61.00 50.45 61.70 51.28 62.33 C 52.11 62.96 52.92 63.75 53.86 64.11 C 54.79 64.47 55.91 64.63 56.90 64.50 C 57.90 64.36 58.85 63.74 59.80 63.31 C 60.75 62.88 61.63 62.26 62.60 61.90 C 63.56 61.54 64.62 61.12 65.61 61.16 C 66.60 61.20 67.62 61.70 68.55 62.14 C 69.49 62.58 70.32 63.25 71.21 63.80 C 72.10 64.35 73.00 64.89 73.88 65.43 C 74.77 65.98 75.66 66.54 76.54 67.10 C 77.42 67.66 78.39 68.13 79.17 68.80 C 79.95 69.47 80.91 70.21 81.22 71.10 C 81.54 72.00 81.33 73.20 81.06 74.17 C 80.78 75.14 80.18 76.09 79.57 76.93 C 78.97 77.76 78.24 78.56 77.43 79.20 C 76.62 79.83 75.68 80.36 74.72 80.74 C 73.75 81.11 72.70 81.32 71.67 81.45 C 70.64 81.57 69.58 81.56 68.54 81.47 C 67.51 81.39 66.47 81.17 65.46 80.94 C 64.44 80.71 63.44 80.41 62.45 80.07 C 61.46 79.74 60.48 79.35 59.53 78.93 C 58.57 78.51 57.64 78.04 56.71 77.56 C 55.78 77.08 54.86 76.58 53.96 76.05 C 53.06 75.52 52.18 74.96 51.30 74.39 C 50.43 73.82 49.55 73.25 48.70 72.64 C 47.86 72.03 47.04 71.37 46.22 70.73 C 45.40 70.08 44.57 69.44 43.76 68.78 C 42.96 68.11 42.18 67.42 41.39 66.73 C 40.61 66.03 39.82 65.35 39.06 64.63 C 38.30 63.91 37.57 63.17 36.84 62.42 C 36.10 61.68 35.37 60.93 34.66 60.17 C 33.94 59.40 33.23 58.64 32.54 57.85 C 31.86 57.06 31.20 56.25 30.54 55.44 C 29.88 54.63 29.22 53.82 28.59 52.99 C 27.95 52.16 27.34 51.31 26.74 50.45 C 26.15 49.59 25.56 48.73 25.00 47.85 C 24.44 46.97 23.89 46.07 23.38 45.17 C 22.86 44.26 22.37 43.34 21.90 42.40 C 21.43 41.47 20.98 40.52 20.58 39.56 C 20.18 38.60 19.80 37.62 19.49 36.62 C 19.17 35.63 18.89 34.61 18.70 33.59 C 18.52 32.57 18.40 31.52 18.36 30.48 C 18.32 29.44 18.28 28.37 18.45 27.35 C 18.61 26.33 18.91 25.29 19.35 24.36 C 19.79 23.43 20.40 22.53 21.10 21.77 C 21.79 21.01 22.65 20.35 23.53 19.81 C 24.41 19.26 25.39 18.66 26.37 18.51 Z" fill="url(#ios_phone-glass)"/>
<g clip-path="url(#ios_phone-clip)">
<path d="M 26.37 18.51 C 27.34 18.36 28.55 18.46 29.39 18.91 C 30.24 19.37 30.83 20.41 31.45 21.25 C 32.07 22.08 32.56 23.02 33.11 23.90 C 33.67 24.79 34.21 25.68 34.77 26.57 C 35.32 27.45 35.89 28.33 36.43 29.22 C 36.98 30.11 37.66 30.97 38.03 31.92 C 38.39 32.88 38.69 33.95 38.61 34.95 C 38.53 35.94 37.96 36.92 37.55 37.88 C 37.14 38.83 36.53 39.72 36.14 40.68 C 35.75 41.64 35.23 42.65 35.22 43.64 C 35.20 44.63 35.58 45.71 36.04 46.63 C 36.49 47.54 37.28 48.30 37.94 49.12 C 38.59 49.93 39.28 50.72 39.97 51.50 C 40.66 52.28 41.37 53.05 42.09 53.81 C 42.81 54.57 43.55 55.31 44.29 56.04 C 45.03 56.78 45.77 57.52 46.54 58.24 C 47.30 58.95 48.09 59.63 48.88 60.31 C 49.68 61.00 50.45 61.70 51.28 62.33 C 52.11 62.96 52.92 63.75 53.86 64.11 C 54.79 64.47 55.91 64.63 56.90 64.50 C 57.90 64.36 58.85 63.74 59.80 63.31 C 60.75 62.88 61.63 62.26 62.60 61.90 C 63.56 61.54 64.62 61.12 65.61 61.16 C 66.60 61.20 67.62 61.70 68.55 62.14 C 69.49 62.58 70.32 63.25 71.21 63.80 C 72.10 64.35 73.00 64.89 73.88 65.43 C 74.77 65.98 75.66 66.54 76.54 67.10 C 77.42 67.66 78.39 68.13 79.17 68.80 C 79.95 69.47 80.91 70.21 81.22 71.10 C 81.54 72.00 81.33 73.20 81.06 74.17 C 80.78 75.14 80.18 76.09 79.57 76.93 C 78.97 77.76 78.24 78.56 77.43 79.20 C 76.62 79.83 75.68 80.36 74.72 80.74 C 73.75 81.11 72.70 81.32 71.67 81.45 C 70.64 81.57 69.58 81.56 68.54 81.47 C 67.51 81.39 66.47 81.17 65.46 80.94 C 64.44 80.71 63.44 80.41 62.45 80.07 C 61.46 79.74 60.48 79.35 59.53 78.93 C 58.57 78.51 57.64 78.04 56.71 77.56 C 55.78 77.08 54.86 76.58 53.96 76.05 C 53.06 75.52 52.18 74.96 51.30 74.39 C 50.43 73.82 49.55 73.25 48.70 72.64 C 47.86 72.03 47.04 71.37 46.22 70.73 C 45.40 70.08 44.57 69.44 43.76 68.78 C 42.96 68.11 42.18 67.42 41.39 66.73 C 40.61 66.03 39.82 65.35 39.06 64.63 C 38.30 63.91 37.57 63.17 36.84 62.42 C 36.10 61.68 35.37 60.93 34.66 60.17 C 33.94 59.40 33.23 58.64 32.54 57.85 C 31.86 57.06 31.20 56.25 30.54 55.44 C 29.88 54.63 29.22 53.82 28.59 52.99 C 27.95 52.16 27.34 51.31 26.74 50.45 C 26.15 49.59 25.56 48.73 25.00 47.85 C 24.44 46.97 23.89 46.07 23.38 45.17 C 22.86 44.26 22.37 43.34 21.90 42.40 C 21.43 41.47 20.98 40.52 20.58 39.56 C 20.18 38.60 19.80 37.62 19.49 36.62 C 19.17 35.63 18.89 34.61 18.70 33.59 C 18.52 32.57 18.40 31.52 18.36 30.48 C 18.32 29.44 18.28 28.37 18.45 27.35 C 18.61 26.33 18.91 25.29 19.35 24.36 C 19.79 23.43 20.40 22.53 21.10 21.77 C 21.79 21.01 22.65 20.35 23.53 19.81 C 24.41 19.26 25.39 18.66 26.37 18.51 Z" transform="translate(0.9 1.05)" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1.7" filter="url(#ios_phone-b1)"/>
<ellipse cx="54" cy="76.5" rx="13" ry="9.5" transform="rotate(35 54 76.5)" fill="url(#ios_phone-tint)" filter="url(#ios_phone-b3)"/>
<path d="M 26.37 18.51 C 27.34 18.36 28.55 18.46 29.39 18.91 C 30.24 19.37 30.83 20.41 31.45 21.25 C 32.07 22.08 32.56 23.02 33.11 23.90 C 33.67 24.79 34.21 25.68 34.77 26.57 C 35.32 27.45 35.89 28.33 36.43 29.22 C 36.98 30.11 37.66 30.97 38.03 31.92 C 38.39 32.88 38.69 33.95 38.61 34.95 C 38.53 35.94 37.96 36.92 37.55 37.88 C 37.14 38.83 36.53 39.72 36.14 40.68 C 35.75 41.64 35.23 42.65 35.22 43.64 C 35.20 44.63 35.58 45.71 36.04 46.63 C 36.49 47.54 37.28 48.30 37.94 49.12 C 38.59 49.93 39.28 50.72 39.97 51.50 C 40.66 52.28 41.37 53.05 42.09 53.81 C 42.81 54.57 43.55 55.31 44.29 56.04 C 45.03 56.78 45.77 57.52 46.54 58.24 C 47.30 58.95 48.09 59.63 48.88 60.31 C 49.68 61.00 50.45 61.70 51.28 62.33 C 52.11 62.96 52.92 63.75 53.86 64.11 C 54.79 64.47 55.91 64.63 56.90 64.50 C 57.90 64.36 58.85 63.74 59.80 63.31 C 60.75 62.88 61.63 62.26 62.60 61.90 C 63.56 61.54 64.62 61.12 65.61 61.16 C 66.60 61.20 67.62 61.70 68.55 62.14 C 69.49 62.58 70.32 63.25 71.21 63.80 C 72.10 64.35 73.00 64.89 73.88 65.43 C 74.77 65.98 75.66 66.54 76.54 67.10 C 77.42 67.66 78.39 68.13 79.17 68.80 C 79.95 69.47 80.91 70.21 81.22 71.10 C 81.54 72.00 81.33 73.20 81.06 74.17 C 80.78 75.14 80.18 76.09 79.57 76.93 C 78.97 77.76 78.24 78.56 77.43 79.20 C 76.62 79.83 75.68 80.36 74.72 80.74 C 73.75 81.11 72.70 81.32 71.67 81.45 C 70.64 81.57 69.58 81.56 68.54 81.47 C 67.51 81.39 66.47 81.17 65.46 80.94 C 64.44 80.71 63.44 80.41 62.45 80.07 C 61.46 79.74 60.48 79.35 59.53 78.93 C 58.57 78.51 57.64 78.04 56.71 77.56 C 55.78 77.08 54.86 76.58 53.96 76.05 C 53.06 75.52 52.18 74.96 51.30 74.39 C 50.43 73.82 49.55 73.25 48.70 72.64 C 47.86 72.03 47.04 71.37 46.22 70.73 C 45.40 70.08 44.57 69.44 43.76 68.78 C 42.96 68.11 42.18 67.42 41.39 66.73 C 40.61 66.03 39.82 65.35 39.06 64.63 C 38.30 63.91 37.57 63.17 36.84 62.42 C 36.10 61.68 35.37 60.93 34.66 60.17 C 33.94 59.40 33.23 58.64 32.54 57.85 C 31.86 57.06 31.20 56.25 30.54 55.44 C 29.88 54.63 29.22 53.82 28.59 52.99 C 27.95 52.16 27.34 51.31 26.74 50.45 C 26.15 49.59 25.56 48.73 25.00 47.85 C 24.44 46.97 23.89 46.07 23.38 45.17 C 22.86 44.26 22.37 43.34 21.90 42.40 C 21.43 41.47 20.98 40.52 20.58 39.56 C 20.18 38.60 19.80 37.62 19.49 36.62 C 19.17 35.63 18.89 34.61 18.70 33.59 C 18.52 32.57 18.40 31.52 18.36 30.48 C 18.32 29.44 18.28 28.37 18.45 27.35 C 18.61 26.33 18.91 25.29 19.35 24.36 C 19.79 23.43 20.40 22.53 21.10 21.77 C 21.79 21.01 22.65 20.35 23.53 19.81 C 24.41 19.26 25.39 18.66 26.37 18.51 Z" transform="translate(-0.55 -0.7)" fill="none" stroke="#ffffff" stroke-opacity="0.24" stroke-width="1.5" filter="url(#ios_phone-b2)"/>
<ellipse cx="26.5" cy="28.5" rx="16" ry="11" transform="rotate(52 26.5 28.5)" fill="url(#ios_phone-spec)" filter="url(#ios_phone-b3)"/>
</g>
</svg>`,
    svg: null,
  },
  safari: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ios_safari-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.16" stop-color="#FDFDFC"/><stop offset="0.42" stop-color="#F8F8F7"/><stop offset="0.68" stop-color="#F2F2F1"/><stop offset="0.90" stop-color="#EBEBE9"/><stop offset="1" stop-color="#F0F0EE"/></linearGradient><linearGradient id="ios_safari-toprim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><linearGradient id="ios_safari-botrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.8"/></linearGradient><linearGradient id="ios_safari-dial" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#71C7F6"/><stop offset="0.12" stop-color="#62BAF4"/><stop offset="0.27" stop-color="#4EAEF4"/><stop offset="0.42" stop-color="#41A1F7"/><stop offset="0.56" stop-color="#3290FA"/><stop offset="0.70" stop-color="#2380F6"/><stop offset="0.83" stop-color="#1A71F2"/><stop offset="0.94" stop-color="#1F76FF"/><stop offset="1" stop-color="#2C7BF8"/></linearGradient><linearGradient id="ios_safari-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4FAFF" stop-opacity="0.30"/><stop offset="0.07" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.82" stop-color="#FFFFFF" stop-opacity="0.05"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.30"/></linearGradient><linearGradient id="ios_safari-tick" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="88"><stop offset="0" stop-color="#DAF1FF"/><stop offset="0.5" stop-color="#D0E9FE"/><stop offset="1" stop-color="#C8DDFF"/></linearGradient><linearGradient id="ios_safari-red" gradientUnits="userSpaceOnUse" x1="90.02" y1="5.17" x2="94.83" y2="9.98"><stop offset="0" stop-color="#FF3B48"/><stop offset="0.16" stop-color="#FF2330"/><stop offset="0.34" stop-color="#FF1826"/><stop offset="0.52" stop-color="#FF1623"/><stop offset="0.74" stop-color="#FE1622"/><stop offset="0.90" stop-color="#FF2432"/><stop offset="1" stop-color="#F92F41"/></linearGradient><linearGradient id="ios_safari-white" gradientUnits="userSpaceOnUse" x1="4.57" y1="89.42" x2="10.58" y2="95.43"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.24" stop-color="#FBFDFF"/><stop offset="0.52" stop-color="#F3F9FF"/><stop offset="0.76" stop-color="#E9F5FF"/><stop offset="0.92" stop-color="#DAEEFF"/><stop offset="1" stop-color="#CCE4FF"/></linearGradient><linearGradient id="ios_safari-rax" gradientUnits="userSpaceOnUse" x1="50.00" y1="50.00" x2="76.16" y2="23.84"><stop offset="0.62" stop-color="#FF8A94" stop-opacity="0"/><stop offset="1" stop-color="#FF8A94" stop-opacity="0.14"/></linearGradient><linearGradient id="ios_safari-wax" gradientUnits="userSpaceOnUse" x1="50.00" y1="50.00" x2="24.54" y2="75.46"><stop offset="0" stop-color="#6EA4DE" stop-opacity="0"/><stop offset="1" stop-color="#7FAEEC" stop-opacity="0.30"/></linearGradient><filter id="ios_safari-recess" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="1.65"/></filter><filter id="ios_safari-nsh" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="1.85"/></filter><filter id="ios_safari-soft2" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="0.58"/></filter><filter id="ios_safari-soft" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="0.75"/></filter><clipPath id="ios_safari-dialclip"><circle cx="50" cy="50" r="40"/></clipPath><clipPath id="ios_safari-redclip"><path d="M45.96 45.96L75.08 23.89Q76.87 23.13 76.11 24.92L54.04 54.04Z"/></clipPath><clipPath id="ios_safari-whiteclip"><path d="M54.04 54.04L25.30 75.37Q22.85 77.15 24.63 74.70L45.96 45.96Z"/></clipPath></defs><rect width="100" height="100" fill="url(#ios_safari-bg)"/><rect width="100" height="4.5" fill="url(#ios_safari-toprim)" opacity="0.45"/><rect y="94.5" width="100" height="5.5" fill="url(#ios_safari-botrim)" opacity="0.5"/><g filter="url(#ios_safari-recess)"><circle cx="51.30" cy="51.55" r="39.60" fill="#8FADEA" opacity="0.72"/></g><circle cx="50" cy="50" r="40" fill="url(#ios_safari-dial)"/><g clip-path="url(#ios_safari-dialclip)"><g fill="none" stroke="url(#ios_safari-tick)" stroke-width="1.17"><line x1="79.70" y1="50.00" x2="86.60" y2="50.00"/><line x1="79.45" y1="46.12" x2="86.29" y2="45.22"/><line x1="78.69" y1="42.31" x2="85.35" y2="40.53"/><line x1="77.44" y1="38.63" x2="83.81" y2="35.99"/><line x1="75.72" y1="35.15" x2="81.70" y2="31.70"/><line x1="73.56" y1="31.92" x2="79.04" y2="27.72"/><line x1="71.00" y1="29.00" x2="75.88" y2="24.12"/><line x1="68.08" y1="26.44" x2="72.28" y2="20.96"/><line x1="64.85" y1="24.28" x2="68.30" y2="18.30"/><line x1="61.37" y1="22.56" x2="64.01" y2="16.19"/><line x1="57.69" y1="21.31" x2="59.47" y2="14.65"/><line x1="53.88" y1="20.55" x2="54.78" y2="13.71"/><line x1="50.00" y1="20.30" x2="50.00" y2="13.40"/><line x1="46.12" y1="20.55" x2="45.22" y2="13.71"/><line x1="42.31" y1="21.31" x2="40.53" y2="14.65"/><line x1="38.63" y1="22.56" x2="35.99" y2="16.19"/><line x1="35.15" y1="24.28" x2="31.70" y2="18.30"/><line x1="31.92" y1="26.44" x2="27.72" y2="20.96"/><line x1="29.00" y1="29.00" x2="24.12" y2="24.12"/><line x1="26.44" y1="31.92" x2="20.96" y2="27.72"/><line x1="24.28" y1="35.15" x2="18.30" y2="31.70"/><line x1="22.56" y1="38.63" x2="16.19" y2="35.99"/><line x1="21.31" y1="42.31" x2="14.65" y2="40.53"/><line x1="20.55" y1="46.12" x2="13.71" y2="45.22"/><line x1="20.30" y1="50.00" x2="13.40" y2="50.00"/><line x1="20.55" y1="53.88" x2="13.71" y2="54.78"/><line x1="21.31" y1="57.69" x2="14.65" y2="59.47"/><line x1="22.56" y1="61.37" x2="16.19" y2="64.01"/><line x1="24.28" y1="64.85" x2="18.30" y2="68.30"/><line x1="26.44" y1="68.08" x2="20.96" y2="72.28"/><line x1="29.00" y1="71.00" x2="24.12" y2="75.88"/><line x1="31.92" y1="73.56" x2="27.72" y2="79.04"/><line x1="35.15" y1="75.72" x2="31.70" y2="81.70"/><line x1="38.63" y1="77.44" x2="35.99" y2="83.81"/><line x1="42.31" y1="78.69" x2="40.53" y2="85.35"/><line x1="46.12" y1="79.45" x2="45.22" y2="86.29"/><line x1="50.00" y1="79.70" x2="50.00" y2="86.60"/><line x1="53.88" y1="79.45" x2="54.78" y2="86.29"/><line x1="57.69" y1="78.69" x2="59.47" y2="85.35"/><line x1="61.37" y1="77.44" x2="64.01" y2="83.81"/><line x1="64.85" y1="75.72" x2="68.30" y2="81.70"/><line x1="68.08" y1="73.56" x2="72.28" y2="79.04"/><line x1="71.00" y1="71.00" x2="75.88" y2="75.88"/><line x1="73.56" y1="68.08" x2="79.04" y2="72.28"/><line x1="75.72" y1="64.85" x2="81.70" y2="68.30"/><line x1="77.44" y1="61.37" x2="83.81" y2="64.01"/><line x1="78.69" y1="57.69" x2="85.35" y2="59.47"/><line x1="79.45" y1="53.88" x2="86.29" y2="54.78"/></g><path d="M45.96 45.96L75.08 23.89Q76.87 23.13 76.11 24.92L25.30 75.37Q22.85 77.15 24.63 74.70Z" transform="translate(1.15 1.75)" fill="#0A3272" opacity="0.48" filter="url(#ios_safari-nsh)"/></g><circle cx="50" cy="50" r="39.70" fill="none" stroke="url(#ios_safari-rim)" stroke-width="0.58"/><path d="M54.04 54.04L25.30 75.37Q22.85 77.15 24.63 74.70L45.96 45.96Z" fill="url(#ios_safari-white)"/><path d="M54.04 54.04L25.30 75.37Q22.85 77.15 24.63 74.70L45.96 45.96Z" fill="url(#ios_safari-wax)"/><g clip-path="url(#ios_safari-whiteclip)"><path d="M45.08 47.90L28.09 70.51L28.67 71.09L46.07 48.89Z" fill="#FFFFFF" opacity="1" filter="url(#ios_safari-soft2)"/></g><path d="M45.96 45.96L75.08 23.89Q76.87 23.13 76.11 24.92L54.04 54.04Z" fill="url(#ios_safari-red)"/><path d="M45.96 45.96L75.08 23.89Q76.87 23.13 76.11 24.92L54.04 54.04Z" fill="url(#ios_safari-rax)"/><g clip-path="url(#ios_safari-redclip)"><path d="M47.96 45.13L71.14 27.30L71.78 27.93L49.02 46.19Z" fill="#FF7A86" opacity="0.38" filter="url(#ios_safari-soft)"/><path d="M54.94 52.11L72.15 29.72L71.68 29.26L54.23 51.40Z" fill="#FF6E7C" opacity="0.26" filter="url(#ios_safari-soft)"/></g></svg>`,
    svg: null,
  },
  camera: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="ios_camera-bg" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#d8d8d8"/>
    <stop offset="0.5" stop-color="#bcbcbc"/>
    <stop offset="0.92" stop-color="#a2a2a2"/>
    <stop offset="1" stop-color="#a6a6a6"/>
  </linearGradient>
  <linearGradient id="ios_camera-toprim" x1="0" y1="0" x2="0" y2="7" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>

  <linearGradient id="ios_camera-ring" x1="0" y1="11" x2="0" y2="89" gradientUnits="userSpaceOnUse">
    <stop offset="0.03" stop-color="#2b2c30"/>
    <stop offset="0.2" stop-color="#232428"/>
    <stop offset="0.5" stop-color="#303135"/>
    <stop offset="0.83" stop-color="#5a5b5f"/>
    <stop offset="0.93" stop-color="#6a6b6f"/>
    <stop offset="0.975" stop-color="#4a4a4c"/>
    <stop offset="1" stop-color="#58585c"/>
  </linearGradient>

  <radialGradient id="ios_camera-glass" cx="45" cy="45" r="26" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#3a3d55"/>
    <stop offset="0.55" stop-color="#31344a"/>
    <stop offset="1" stop-color="#282b3c"/>
  </radialGradient>
  <radialGradient id="ios_camera-halo" cx="43" cy="43.2" r="14" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#a9bce8" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#7286bb" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="ios_camera-blob" cx="42.6" cy="43.2" r="9.8" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.26" stop-color="#ffffff"/>
    <stop offset="0.52" stop-color="#eaf4ff" stop-opacity="0.95"/>
    <stop offset="0.76" stop-color="#c3d4fb" stop-opacity="0.66"/>
    <stop offset="1" stop-color="#9db3ec" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="ios_camera-bar" x1="0" y1="32.5" x2="0" y2="50" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#67d2ff" stop-opacity="0.45"/>
    <stop offset="0.24" stop-color="#3cb6fb"/>
    <stop offset="0.5" stop-color="#2ea3f5"/>
    <stop offset="0.8" stop-color="#2a6cc0" stop-opacity="0.8"/>
    <stop offset="1" stop-color="#2c5495" stop-opacity="0"/>
  </linearGradient>

  <clipPath id="ios_camera-gclip"><circle cx="50" cy="50" r="23.9"/></clipPath>
  <filter id="ios_camera-sh" x="-30" y="-30" width="160" height="160"><feGaussianBlur stdDeviation="1.1"/></filter>
  <filter id="ios_camera-b06" x="-30" y="-30" width="160" height="160"><feGaussianBlur stdDeviation="0.6"/></filter>
  <filter id="ios_camera-b10" x="-30" y="-30" width="160" height="160"><feGaussianBlur stdDeviation="1"/></filter>
  <filter id="ios_camera-b15" x="-30" y="-30" width="160" height="160"><feGaussianBlur stdDeviation="1.5"/></filter>
  <filter id="ios_camera-b22" x="-30" y="-30" width="160" height="160"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="ios_camera-b30" x="-30" y="-30" width="160" height="160"><feGaussianBlur stdDeviation="3"/></filter>
</defs>

<rect width="100" height="100" fill="url(#ios_camera-bg)"/>
<rect width="100" height="7" fill="url(#ios_camera-toprim)"/>

<!-- contact shadow: sits under the barrel, reads only along the bottom -->
<circle cx="50" cy="54.4" r="36.6" fill="#000000" opacity="0.36" filter="url(#ios_camera-sh)"/>

<!-- barrel -->
<circle cx="50" cy="50" r="39" fill="url(#ios_camera-ring)" filter="url(#ios_camera-b10)"/>
<path d="M18 63 A36.4 36.4 0 0 0 82 63" fill="none" stroke="#a6a7ab" stroke-opacity="0.25"
      stroke-width="2" filter="url(#ios_camera-b22)"/>

<!-- inner throat -->
<circle cx="50" cy="50" r="26" fill="#131419" filter="url(#ios_camera-b06)"/>

<!-- glass -->
<circle cx="50" cy="50" r="23.9" fill="url(#ios_camera-glass)"/>

<g clip-path="url(#ios_camera-gclip)">
  <!-- the two quadrants the flare does not touch stay near-black -->
  <ellipse cx="41" cy="59" rx="13" ry="12" fill="#22242e" opacity="0.5" filter="url(#ios_camera-b30)"/>
  <ellipse cx="58" cy="39" rx="12" ry="11" fill="#22242e" opacity="0.5" filter="url(#ios_camera-b30)"/>

  <!-- outer element rim: a faint ring of light all the way round -->
  <circle cx="50" cy="50" r="21.3" fill="none" stroke="#98a7ce" stroke-opacity="0.32"
          stroke-width="2.8" filter="url(#ios_camera-b22)"/>

  <!-- broad blue glow filling the lower right of the element -->
  <ellipse cx="61" cy="59.5" rx="13" ry="11" transform="rotate(-25 61 59.5)" fill="#5f8ad4"
           opacity="0.62" filter="url(#ios_camera-b30)"/>

  <!-- warm chromatic ring, r ~ 14 -->
  <ellipse cx="39.4" cy="48.4" rx="5.8" ry="2" transform="rotate(-8 39.4 48.4)" fill="#cf9089"
           opacity="1" filter="url(#ios_camera-b15)"/>
  <ellipse cx="63.4" cy="48.2" rx="6.2" ry="1.9" transform="rotate(-10 63.4 48.2)" fill="#9a5a5c"
           opacity="0.95" filter="url(#ios_camera-b15)"/>

  <!-- lower-right crescent -->
  <path d="M65.6 57.6 A17 17 0 0 1 55.6 66.4" fill="none" stroke="#c6d6f8" stroke-opacity="0.62"
        stroke-width="5.4" filter="url(#ios_camera-b22)"/>
  <path d="M62.4 53.3 A12.8 12.8 0 0 1 50.8 62.7" fill="none" stroke="#1183e4" stroke-opacity="1"
        stroke-width="5.2" filter="url(#ios_camera-b15)"/>
  <path d="M61.6 55.4 A12.6 12.6 0 0 1 51.8 62.5" fill="none" stroke="#c9f0ff" stroke-opacity="0.95"
        stroke-width="3.8" filter="url(#ios_camera-b15)"/>
  <ellipse cx="63.4" cy="52.2" rx="9" ry="2.9" transform="rotate(6 63.4 52.2)" fill="#e2d8ec"
           opacity="1" filter="url(#ios_camera-b22)"/>
  <ellipse cx="58.8" cy="57" rx="5" ry="2.4" transform="rotate(-42 58.8 57)" fill="#f4feff"
           opacity="0.95" filter="url(#ios_camera-b15)"/>
  <ellipse cx="53.4" cy="61.4" rx="3.4" ry="2" transform="rotate(-62 53.4 61.4)" fill="#5cc6fb"
           opacity="0.85" filter="url(#ios_camera-b15)"/>

  <!-- main specular highlight -->
  <circle cx="43" cy="43.2" r="14" fill="url(#ios_camera-halo)"/>
  <ellipse cx="42.6" cy="43.2" rx="9.8" ry="8.8" fill="url(#ios_camera-blob)" filter="url(#ios_camera-b06)"/>

  <!-- bright blue streak on the right flank of the highlight -->
  <ellipse cx="48.6" cy="40.2" rx="2.5" ry="7.4" transform="rotate(-5 48.6 40.2)"
           fill="url(#ios_camera-bar)" filter="url(#ios_camera-b06)"/>

  <!-- element edge shading -->
  <circle cx="50" cy="50" r="23.9" fill="none" stroke="#141728" stroke-opacity="0.34"
          stroke-width="2.6" filter="url(#ios_camera-b22)"/>
</g>
</svg>`,
    svg: null,
  },
  photos: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="ios_photos-bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#F4F4F3"/><stop offset="1" stop-color="#EAEAE9"/></linearGradient>
<linearGradient id="ios_photos-toprim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<linearGradient id="ios_photos-botrim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".045"/></linearGradient>
<radialGradient id="ios_photos-spec" cx=".5" cy=".5" r=".5">
<stop offset="0" stop-color="#ffffff" stop-opacity=".06"/><stop offset=".55" stop-color="#ffffff" stop-opacity=".025"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<linearGradient id="ios_photos-rim" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".20"/><stop offset=".40" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity=".09"/></linearGradient>
<filter id="ios_photos-blur" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="1.9"/></filter>
<filter id="ios_photos-blur2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
<mask id="ios_photos-shm" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(0 50.4 50.8)" fill="#000"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(45 50.4 50.8)" fill="#000"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(90 50.4 50.8)" fill="#000"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(135 50.4 50.8)" fill="#000"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(180 50.4 50.8)" fill="#000"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(225 50.4 50.8)" fill="#000"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(270 50.4 50.8)" fill="#000"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(315 50.4 50.8)" fill="#000"/></mask>
<clipPath id="ios_photos-clip"><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(0 50.4 50.8)" /><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(45 50.4 50.8)" /><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(90 50.4 50.8)" /><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(135 50.4 50.8)" /><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(180 50.4 50.8)" /><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(225 50.4 50.8)" /><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(270 50.4 50.8)" /><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(315 50.4 50.8)" /></clipPath>
<linearGradient id="ios_photos-g0" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#f48b30"/><stop offset="1" stop-color="#f4902f"/></linearGradient>
<linearGradient id="ios_photos-g1" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#fac03e"/><stop offset="1" stop-color="#fbcd41"/></linearGradient>
<linearGradient id="ios_photos-g2" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#80bd35"/><stop offset="1" stop-color="#88c838"/></linearGradient>
<linearGradient id="ios_photos-g3" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#449c61"/><stop offset="1" stop-color="#66b588"/></linearGradient>
<linearGradient id="ios_photos-g4" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#3e77e7"/><stop offset="1" stop-color="#6c9dee"/></linearGradient>
<linearGradient id="ios_photos-g5" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#8b63da"/><stop offset="1" stop-color="#a78de4"/></linearGradient>
<linearGradient id="ios_photos-g6" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#e258ba"/><stop offset="1" stop-color="#ea66c7"/></linearGradient>
<linearGradient id="ios_photos-g7" x1=".5" y1="1" x2=".5" y2="0"><stop offset="0" stop-color="#f06363"/><stop offset="1" stop-color="#f16367"/></linearGradient></defs><g><rect width="100" height="100" fill="url(#ios_photos-bg)"/><rect width="100" height="5" fill="url(#ios_photos-toprim)"/><rect y="92" width="100" height="8" fill="url(#ios_photos-botrim)"/><g mask="url(#ios_photos-shm)"><g opacity=".065" filter="url(#ios_photos-blur)" transform="translate(0 1.5)"><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(0 50.4 50.8)" fill="#000"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(45 50.4 50.8)" fill="#000"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(90 50.4 50.8)" fill="#000"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(135 50.4 50.8)" fill="#000"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(180 50.4 50.8)" fill="#000"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(225 50.4 50.8)" fill="#000"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(270 50.4 50.8)" fill="#000"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(315 50.4 50.8)" fill="#000"/></g></g><g clip-path="url(#ios_photos-clip)"><rect width="100" height="100" fill="#ffffff"/></g><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(0 50.4 50.8)" fill="url(#ios_photos-g0)" fill-opacity="0.82"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(45 50.4 50.8)" fill="url(#ios_photos-g1)" fill-opacity="0.82"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(90 50.4 50.8)" fill="url(#ios_photos-g2)" fill-opacity="0.82"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(135 50.4 50.8)" fill="url(#ios_photos-g3)" fill-opacity="0.82"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(180 50.4 50.8)" fill="url(#ios_photos-g4)" fill-opacity="0.82"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(225 50.4 50.8)" fill="url(#ios_photos-g5)" fill-opacity="0.82"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(270 50.4 50.8)" fill="url(#ios_photos-g6)" fill-opacity="0.82"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(315 50.4 50.8)" fill="url(#ios_photos-g7)" fill-opacity="0.82"/><rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(0 50.4 50.8)" fill="#8E8E90" opacity=".05"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(45 50.4 50.8)" fill="#8E8E90" opacity=".05"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(90 50.4 50.8)" fill="#8E8E90" opacity=".05"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(135 50.4 50.8)" fill="#8E8E90" opacity=".05"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(180 50.4 50.8)" fill="#8E8E90" opacity=".05"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(225 50.4 50.8)" fill="#8E8E90" opacity=".05"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(270 50.4 50.8)" fill="#8E8E90" opacity=".05"/>
<rect x="39" y="10.2" width="22.8" height="36.7" rx="11.4" transform="rotate(315 50.4 50.8)" fill="#8E8E90" opacity=".05"/><rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(0 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/>
<rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(45 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/>
<rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(90 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/>
<rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(135 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/>
<rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(180 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/>
<rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(225 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/>
<rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(270 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/>
<rect x="40" y="11.2" width="20.8" height="34.7" rx="10.4" transform="rotate(315 50.4 50.8)" fill="none" stroke="url(#ios_photos-rim)" stroke-width="1.8"/><g clip-path="url(#ios_photos-clip)"><ellipse cx="34" cy="30" rx="30" ry="26" fill="url(#ios_photos-spec)" filter="url(#ios_photos-blur2)"/></g></g></svg>`,
    svg: null,
  },
  mail: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_mail-bg" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#75BCF0"/><stop offset="0.12" stop-color="#73BAF0"/><stop offset="0.5" stop-color="#5394F0"/><stop offset="1" stop-color="#3268F2"/>
</linearGradient>
<linearGradient id="ios_mail-toprim" x1="50" y1="0" x2="50" y2="3.4" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.30"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.09"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_mail-botrim" x1="50" y1="100" x2="50" y2="95.5" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_mail-body" x1="50" y1="25" x2="50" y2="74.8" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#F3F7FE"/><stop offset="0.22" stop-color="#E1EBFC"/><stop offset="0.5" stop-color="#CBDDFA"/><stop offset="0.86" stop-color="#94B8EE"/><stop offset="1" stop-color="#8DB3ED"/>
</linearGradient>
<linearGradient id="ios_mail-flap" x1="42" y1="23" x2="53" y2="60" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.72" stop-color="#FDFEFF"/><stop offset="1" stop-color="#EFF4FB"/>
</linearGradient>
<linearGradient id="ios_mail-envrim" x1="30" y1="24" x2="62" y2="76" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.72"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.42"/><stop offset="1" stop-color="#fff" stop-opacity="0.85"/>
</linearGradient>
<linearGradient id="ios_mail-fold" x1="16" y1="74" x2="41" y2="49" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0.42"/>
</linearGradient>
<linearGradient id="ios_mail-fold2" x1="84" y1="74" x2="59" y2="49" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0.38"/>
</linearGradient>
<clipPath id="ios_mail-envclip"><rect x="13.3" y="25" width="73.4" height="49.8" rx="6.7"/></clipPath>
<filter id="ios_mail-drop" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="1.9"/></filter>
<filter id="ios_mail-soft" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur stdDeviation="1.5"/></filter>
<filter id="ios_mail-soft2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>
<filter id="ios_mail-txt" x="-20%" y="-70%" width="140%" height="240%"><feGaussianBlur stdDeviation="0.38"/></filter>
</defs>

<rect width="100" height="100" fill="url(#ios_mail-bg)"/>
<rect width="100" height="3.6" fill="url(#ios_mail-toprim)"/>
<rect y="95" width="100" height="5" fill="url(#ios_mail-botrim)"/>
<g filter="url(#ios_mail-soft2)" opacity="0.5">
<ellipse cx="9" cy="90.5" rx="16" ry="10" fill="#fff" opacity="0.17"/>
<ellipse cx="91" cy="90.5" rx="16" ry="10" fill="#fff" opacity="0.17"/>
</g>

<g filter="url(#ios_mail-drop)">
<rect x="13.9" y="27.6" width="72.2" height="49.2" rx="6.7" fill="#0B2FA8" opacity="0.25"/>
</g>

<rect x="13.3" y="25" width="73.4" height="49.8" rx="6.7" fill="url(#ios_mail-body)"/>

<g clip-path="url(#ios_mail-envclip)">
  <path d="M13 77 L41.5 48.5" fill="none" stroke="url(#ios_mail-fold)" stroke-width="0.8" stroke-linecap="round"/>
  <path d="M87 77 L58.5 48.5" fill="none" stroke="url(#ios_mail-fold2)" stroke-width="0.8" stroke-linecap="round"/>
  <g filter="url(#ios_mail-soft)">
    <rect x="16" y="73.4" width="68" height="2.6" rx="1.3" fill="#fff" opacity="0.30"/>
  </g>
  <g filter="url(#ios_mail-soft)">
    <path d="M10 21 L90 21 L53.1 57.6 Q50 60.7 46.9 57.6 Z" fill="#3C6AAE" opacity="0.11"/>
  </g>
  <g filter="url(#ios_mail-soft2)">
    <ellipse cx="50" cy="62.8" rx="21" ry="5.2" fill="#fff" opacity="0.22"/>
  </g>
  <path d="M11.6 23.2 L88.4 23.2 L53.1 56.2 Q50 59.3 46.9 56.2 Z" fill="url(#ios_mail-flap)"/>
  <path d="M11.6 23.2 L46.9 56.2 Q50 59.3 53.1 56.2 L88.4 23.2" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="0.7" stroke-linejoin="round"/>
  <g fill="#93A9C6" opacity="0.36" filter="url(#ios_mail-txt)">
    <rect x="32.60" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="33.88" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="35.16" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="36.44" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="37.72" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="39.95" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="41.23" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="42.51" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="43.79" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="45.07" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="47.30" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="48.58" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="49.86" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="51.14" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="52.42" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="53.70" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="54.98" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="56.26" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="57.54" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="58.82" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="61.05" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="62.33" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="63.61" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="64.89" y="30.05" width="0.86" height="1.3" rx="0.34"/>
    <rect x="66.17" y="30.05" width="0.86" height="1.3" rx="0.34"/>
  </g>
  <g filter="url(#ios_mail-soft2)">
    <ellipse cx="30" cy="31" rx="15" ry="7" fill="#fff" opacity="0.5"/>
  </g>
</g>

<rect x="13.75" y="25.45" width="72.5" height="48.9" rx="6.25" fill="none" stroke="url(#ios_mail-envrim)" stroke-width="0.9"/>
</svg>`,
    svg: null,
  },
  maps: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_maps-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#FBFBFC"/><stop offset="1" stop-color="#ECEDEF"/></linearGradient>
<linearGradient id="ios_maps-gA" x1=".1" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="#5CEA78"/><stop offset=".55" stop-color="#43DF60"/><stop offset="1" stop-color="#37D253"/></linearGradient>
<linearGradient id="ios_maps-gB" x1=".18" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#54E871"/><stop offset=".42" stop-color="#41DD5E"/><stop offset="1" stop-color="#34D050"/></linearGradient>
<linearGradient id="ios_maps-road" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#39A2FF"/><stop offset=".16" stop-color="#1093FF"/><stop offset="1" stop-color="#0D7FF8"/></linearGradient>
<linearGradient id="ios_maps-pink" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#FF9AD6"/><stop offset=".5" stop-color="#FC81C9"/><stop offset="1" stop-color="#F16DBA"/></linearGradient>
<linearGradient id="ios_maps-yel" x1=".05" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#FFE05A"/><stop offset=".4" stop-color="#FFCF14"/><stop offset="1" stop-color="#F3BB04"/></linearGradient>
<linearGradient id="ios_maps-arc" x1=".1" y1="0" x2=".85" y2=".9"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".40"/><stop offset=".45" stop-color="#FFFFFF" stop-opacity=".70"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".92"/></linearGradient>
<linearGradient id="ios_maps-ring" x1=".26" y1="0" x2=".74" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#FCFCFD"/><stop offset="1" stop-color="#EBECEF"/></linearGradient>
<linearGradient id="ios_maps-disc" x1=".28" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#0A7DEF"/><stop offset=".5" stop-color="#2290FB"/><stop offset="1" stop-color="#4BA4FF"/></linearGradient>
<radialGradient id="ios_maps-discin" cx=".64" cy=".72" r=".7"><stop offset=".5" stop-color="#0A56A6" stop-opacity="0"/><stop offset="1" stop-color="#08529E" stop-opacity=".52"/></radialGradient>
<radialGradient id="ios_maps-discsp" cx=".32" cy=".28" r=".55"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".20"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
<linearGradient id="ios_maps-arw" x1=".18" y1="0" x2=".82" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#F8FBFF"/><stop offset="1" stop-color="#D9E8FA"/></linearGradient>
<linearGradient id="ios_maps-toplit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".40"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
<linearGradient id="ios_maps-botshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".11"/></linearGradient>
<filter id="ios_maps-b1" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.5"/></filter>
<filter id="ios_maps-b2" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="2.3"/></filter>
<filter id="ios_maps-b3" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4.5"/></filter>
<filter id="ios_maps-b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.0"/></filter>
<clipPath id="ios_maps-cgB"><path d="M53.4,-4 L53.4,28 C53.4,40 58,48 66,54 C76,61.5 90,69 104,76.5 L104,-4 Z"/></clipPath>
<clipPath id="ios_maps-carw"><path d="M37.2,46.0 L27.9,68.6 L37.2,61.6 L46.5,68.6 Z" stroke-width="3" stroke-linejoin="round" stroke="#000"/></clipPath>
</defs>

<rect width="100" height="100" fill="url(#ios_maps-base)"/>

<!-- soft shadows cast by the map blocks onto the white roads -->
<g filter="url(#ios_maps-b1)" opacity=".16">
  <path d="M22.6,-4 L22.6,17.9 Q22.6,22.2 19.1,20.2 L-4,7.1 Z" fill="#4A5560"/>
  <path d="M-4,38.6 L21.0,53.3 L21.0,104 L-4,104 Z" fill="#4A5560"/>
  <path d="M60.9,79.9 Q59.6,78.4 58.4,80.1 L53.9,86.0 L53.9,104 L100,104 L100,95.6 Z" fill="#6B5A28"/>
  <path d="M54.1,-4 L54.1,28.6 C54.1,40.6 58.7,48.6 66.7,54.6 C76.7,62.1 90.7,69.6 104,77 L104,-4 Z" fill="#3E6B45"/>
</g>

<!-- green block, top-left -->
<path d="M21.9,-4 L21.9,17.6 Q21.9,21.6 18.4,19.5 L-4,6.4 Z" fill="url(#ios_maps-gA)"/>
<path d="M21.9,-4 L21.9,17.6 Q21.9,21.6 18.4,19.5 L-4,6.4 Z" fill="none" stroke="#FFFFFF" stroke-opacity=".34" stroke-width="1"/>

<!-- blue road -->
<path d="M27.0,-4 L49.2,-4 L49.2,74 L27.0,74 Z" fill="url(#ios_maps-road)"/>
<rect x="27.0" y="-4" width="1.5" height="78" fill="#FFFFFF" opacity=".16"/>

<!-- pink block -->
<path d="M-4,37.9 L20.3,53.2 L20.3,104 L-4,104 Z" fill="url(#ios_maps-pink)"/>

<!-- yellow wedge -->
<path d="M60.4,79.2 Q59.1,77.7 57.9,79.4 L53.4,85.3 L53.4,104 L100,104 L100,94.9 Z" fill="url(#ios_maps-yel)"/>

<!-- green park, right -->
<path d="M53.4,-4 L53.4,28 C53.4,40 58,48 66,54 C76,61.5 90,69 104,76.5 L104,-4 Z" fill="url(#ios_maps-gB)"/>

<!-- pale glass ribbon curving round the top-right -->
<g clip-path="url(#ios_maps-cgB)">
  <path d="M71.8,-12.3 A30 30 0 0 0 110.3,26.2" fill="none" stroke="url(#ios_maps-arc)" stroke-width="19.5"/>
  <path d="M74.9,-9.0 A26 26 0 0 0 106.9,23.0" fill="none" stroke="#FFFFFF" stroke-opacity=".30" stroke-width="4" filter="url(#ios_maps-b4)"/>
  <path d="M68.6,-15.5 A34 34 0 0 0 113.5,29.4" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="2.4" filter="url(#ios_maps-b4)"/>
  <ellipse cx="92" cy="34" rx="13" ry="10" fill="#FFFFFF" opacity=".26" filter="url(#ios_maps-b3)"/>
</g>

<!-- tile glass: top rim light, bottom rim shade -->
<rect x="0" y="0" width="100" height="5" fill="url(#ios_maps-toplit)"/>
<rect x="0" y="92" width="100" height="8" fill="url(#ios_maps-botshade)"/>

<!-- location marker -->
<circle cx="37.2" cy="62.7" r="27.8" fill="#0E2440" opacity=".20" filter="url(#ios_maps-b2)"/>
<circle cx="37.2" cy="60" r="28.6" fill="#FFFFFF" opacity=".40" filter="url(#ios_maps-b4)"/>
<circle cx="37.2" cy="60" r="27.8" fill="url(#ios_maps-ring)"/>
<circle cx="36.8" cy="59.4" r="23.7" fill="#A8B2BE" opacity=".28" filter="url(#ios_maps-b4)"/>
<circle cx="37.2" cy="60" r="23.0" fill="url(#ios_maps-disc)"/>
<circle cx="37.2" cy="60" r="23.0" fill="url(#ios_maps-discin)"/>
<circle cx="37.2" cy="60" r="23.0" fill="url(#ios_maps-discsp)"/>

<!-- arrow -->
<g filter="url(#ios_maps-b4)" opacity=".30"><path d="M37.2,48.0 L27.9,70.6 L37.2,63.6 L46.5,70.6 Z" fill="#004E9E" stroke="#004E9E" stroke-width="3" stroke-linejoin="round"/></g>
<path d="M37.2,46.0 L27.9,68.6 L37.2,61.6 L46.5,68.6 Z" fill="url(#ios_maps-arw)" stroke="url(#ios_maps-arw)" stroke-width="3" stroke-linejoin="round"/>
<g clip-path="url(#ios_maps-carw)"><path d="M37.2,39.8 L27,66.2" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".85" filter="url(#ios_maps-b4)"/></g>
</svg>`,
    svg: null,
  },
  clock: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="ios_clock-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.2" stop-color="#FCFCFC"/><stop offset="0.58" stop-color="#F2F2F2"/><stop offset="1" stop-color="#E8E8E8"/></linearGradient><radialGradient id="ios_clock-glow" cx="0.3" cy="0.16" r="0.75"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient><linearGradient id="ios_clock-foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.045"/></linearGradient></defs><rect width="100" height="100" fill="url(#ios_clock-bg)"/><rect width="100" height="100" fill="url(#ios_clock-glow)"/><rect y="86" width="100" height="14" fill="url(#ios_clock-foot)"/><path d="M54.05 11.51L54.64 5.89M58.05 12.15L59.22 6.62M61.96 13.19L63.7 7.82M65.74 14.65L68.04 9.48M72.75 18.69L76.07 14.12M75.9 21.24L79.68 17.04M78.76 24.1L82.96 20.32M81.31 27.25L85.88 23.93M85.35 34.26L90.52 31.96M86.81 38.04L92.18 36.3M87.85 41.95L93.38 40.78M88.49 45.95L94.11 45.36M88.49 54.05L94.11 54.64M87.85 58.05L93.38 59.22M86.81 61.96L92.18 63.7M85.35 65.74L90.52 68.04M81.31 72.75L85.88 76.07M78.76 75.9L82.96 79.68M75.9 78.76L79.68 82.96M72.75 81.31L76.07 85.88M65.74 85.35L68.04 90.52M61.96 86.81L63.7 92.18M58.05 87.85L59.22 93.38M54.05 88.49L54.64 94.11M45.95 88.49L45.36 94.11M41.95 87.85L40.78 93.38M38.04 86.81L36.3 92.18M34.26 85.35L31.96 90.52M27.25 81.31L23.93 85.88M24.1 78.76L20.32 82.96M21.24 75.9L17.04 79.68M18.69 72.75L14.12 76.07M14.65 65.74L9.48 68.04M13.19 61.96L7.82 63.7M12.15 58.05L6.62 59.22M11.51 54.05L5.89 54.64M11.51 45.95L5.89 45.36M12.15 41.95L6.62 40.78M13.19 38.04L7.82 36.3M14.65 34.26L9.48 31.96M18.69 27.25L14.12 23.93M21.24 24.1L17.04 20.32M24.1 21.24L20.32 17.04M27.25 18.69L23.93 14.12M34.26 14.65L31.96 9.48M38.04 13.19L36.3 7.82M41.95 12.15L40.78 6.62M45.95 11.51L45.36 5.89" stroke="#C4C4C4" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M68 18.82L72.07 11.76M81.18 32L88.24 27.92M86 50L94.15 50M81.18 68L88.24 72.07M68 81.18L72.07 88.24M50 86L50 94.15M32 81.18L27.92 88.24M18.82 68L11.76 72.08M14 50L5.85 50M18.82 32L11.76 27.92M32 18.82L27.92 11.76" stroke="#464646" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M50 13.35 L50 5.5" stroke="#3E3E3E" stroke-width="1.1" stroke-linecap="round" fill="none"/><text x="50" y="27.33" font-family="-apple-system,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif" font-size="13.6" font-weight="500" letter-spacing="-0.75" fill="#444444" stroke="#444444" stroke-width="0.36" stroke-linejoin="round" text-anchor="middle">12</text><text x="78.6" y="54.83" font-family="-apple-system,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif" font-size="13.6" font-weight="500" letter-spacing="0" fill="#444444" stroke="#444444" stroke-width="0.36" stroke-linejoin="round" text-anchor="middle">3</text><text x="50" y="82.73" font-family="-apple-system,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif" font-size="13.6" font-weight="500" letter-spacing="0" fill="#444444" stroke="#444444" stroke-width="0.36" stroke-linejoin="round" text-anchor="middle">6</text><text x="21.4" y="54.83" font-family="-apple-system,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif" font-size="13.6" font-weight="500" letter-spacing="0" fill="#444444" stroke="#444444" stroke-width="0.36" stroke-linejoin="round" text-anchor="middle">9</text><path d="M49.47 50.75L44.97 47.6L42.3 47.23L29.56 38.31A2.15 2.15 0 0 1 32.02 34.79L44.76 43.71L46.02 46.09L50.53 49.25Z" fill="#0C0C0C"/><path d="M49.46 49.26L53.91 46.02L55.13 43.62L78.63 26.54A2.15 2.15 0 0 1 81.16 30.02L57.65 47.1L54.99 47.51L50.54 50.74Z" fill="#0C0C0C"/><circle cx="50" cy="50" r="3.15" fill="#0C0C0C"/><rect x="49" y="43.3" width="2" height="45.7" fill="#F19435"/><circle cx="50" cy="50" r="1.9" fill="#F19435"/><circle cx="50" cy="50" r="0.9" fill="#FBFBFB"/></svg>`,
    svg: null,
  },
  weather: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ios_weather-sky" x1="0.16" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63B2F2"/><stop offset="0.34" stop-color="#4198EA"/><stop offset="1" stop-color="#2A6BCB"/></linearGradient><radialGradient id="ios_weather-vig" gradientUnits="userSpaceOnUse" cx="48" cy="26" r="84"><stop offset="0.45" stop-color="#0A2A66" stop-opacity="0"/><stop offset="1" stop-color="#0A2A66" stop-opacity="0.28"/></radialGradient><linearGradient id="ios_weather-rimtop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><linearGradient id="ios_weather-rimbot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#031A40" stop-opacity="0"/><stop offset="1" stop-color="#031A40" stop-opacity="0.20"/></linearGradient><radialGradient id="ios_weather-sun" gradientUnits="userSpaceOnUse" cx="65" cy="27" r="36"><stop offset="0" stop-color="#FEDC6A"/><stop offset="0.42" stop-color="#FBC93F"/><stop offset="1" stop-color="#F2AC1E"/></radialGradient><radialGradient id="ios_weather-sunspec" gradientUnits="userSpaceOnUse" cx="66" cy="26" r="12"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.38"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient><linearGradient id="ios_weather-cloud" x1="0.28" y1="0.02" x2="0.46" y2="1"><stop offset="0" stop-color="#FCFEFF"/><stop offset="0.34" stop-color="#E6F1FC"/><stop offset="0.68" stop-color="#C2D9F2"/><stop offset="1" stop-color="#9EBDE2"/></linearGradient><radialGradient id="ios_weather-warm" gradientUnits="userSpaceOnUse" cx="77" cy="41" r="40"><stop offset="0" stop-color="#FFD97F" stop-opacity="0.95"/><stop offset="0.40" stop-color="#FFE6A8" stop-opacity="0.66"/><stop offset="0.72" stop-color="#FFF1CB" stop-opacity="0.26"/><stop offset="1" stop-color="#FFF8E4" stop-opacity="0"/></radialGradient><radialGradient id="ios_weather-spec" gradientUnits="userSpaceOnUse" cx="33" cy="39" r="19"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.82"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient><path id="ios_weather-cloudpath" d="M11 62.5 L11 58.5 A10 10 0 0 1 25.80 49.73 A17.5 17.5 0 0 1 60.06 42.61 A13 13 0 0 1 81.5 52.5 L81.5 65.5 A11 11 0 0 1 70.5 76.5 L25 76.5 A14 14 0 0 1 11 62.5 Z"/><clipPath id="ios_weather-cloudclip"><use href="#ios_weather-cloudpath"/></clipPath><clipPath id="ios_weather-sunclip"><circle cx="72" cy="37.5" r="19"/></clipPath><filter id="ios_weather-drop" filterUnits="userSpaceOnUse" x="-15" y="-15" width="130" height="130"><feGaussianBlur stdDeviation="2.4"/></filter><filter id="ios_weather-drop2" filterUnits="userSpaceOnUse" x="-15" y="-15" width="130" height="130"><feGaussianBlur stdDeviation="1.2"/></filter><filter id="ios_weather-soft" filterUnits="userSpaceOnUse" x="-15" y="-15" width="130" height="130"><feGaussianBlur stdDeviation="3.2"/></filter></defs><rect width="100" height="100" fill="url(#ios_weather-sky)"/><rect width="100" height="100" fill="url(#ios_weather-vig)"/><rect x="0" y="0" width="100" height="10" fill="url(#ios_weather-rimtop)"/><rect x="0" y="86" width="100" height="14" fill="url(#ios_weather-rimbot)"/><circle cx="72.7" cy="40.3" r="19" fill="#0E3574" opacity="0.32" filter="url(#ios_weather-drop)"/><circle cx="72" cy="37.5" r="19" fill="url(#ios_weather-sun)"/><g clip-path="url(#ios_weather-sunclip)"><ellipse cx="66" cy="26" rx="11" ry="8" fill="url(#ios_weather-sunspec)"/><use href="#ios_weather-cloudpath" fill="#C07A12" opacity="0.28" transform="translate(1.4,-1.8)" filter="url(#ios_weather-soft)"/><circle cx="72" cy="37.5" r="18.4" fill="none" stroke="#FFE79C" stroke-opacity="0.42" stroke-width="1.2"/></g><use href="#ios_weather-cloudpath" fill="#0B2E68" opacity="0.30" transform="translate(0.9,2.8)" filter="url(#ios_weather-drop)"/><use href="#ios_weather-cloudpath" fill="#0B2E68" opacity="0.16" transform="translate(0.4,1.1)" filter="url(#ios_weather-drop2)"/><use href="#ios_weather-cloudpath" fill="url(#ios_weather-cloud)"/><g clip-path="url(#ios_weather-cloudclip)"><rect x="35" y="16" width="65" height="68" fill="url(#ios_weather-warm)"/><ellipse cx="33" cy="38" rx="16" ry="12" fill="url(#ios_weather-spec)"/><rect x="0" y="62" width="100" height="24" fill="#4A78B2" opacity="0.12" filter="url(#ios_weather-soft)"/><use href="#ios_weather-cloudpath" fill="none" stroke="#FFFFFF" stroke-opacity="0.44" stroke-width="1.4" transform="translate(0.6,0.8)"/><use href="#ios_weather-cloudpath" fill="none" stroke="#FFFFFF" stroke-opacity="0.32" stroke-width="1.2" transform="translate(-0.6,-0.8)"/></g></svg>`,
    svg: null,
  },
  settings: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"> <defs> <linearGradient id="ios_settings-bg" x1="0" y1="0" x2="0" y2="1"> <stop offset="0" stop-color="#ACABB2"/><stop offset="0.23" stop-color="#9C9BA2"/> <stop offset="0.50" stop-color="#807F86"/><stop offset="0.78" stop-color="#6A6970"/> <stop offset="0.90" stop-color="#605F66"/><stop offset="1" stop-color="#5C5B62"/></linearGradient> <linearGradient id="ios_settings-toprim" x1="0" y1="0" x2="0" y2="1"> <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.78"/><stop offset="0.4" stop-color="#FFFFFF" stop-opacity="0.36"/> <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient> <linearGradient id="ios_settings-botrim" x1="0" y1="0" x2="0" y2="1"> <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.06"/> <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.5"/></linearGradient> <linearGradient id="ios_settings-metal" gradientUnits="userSpaceOnUse" x1="58" y1="10" x2="44" y2="92"> <stop offset="0" stop-color="#FEFEFF"/><stop offset="0.33" stop-color="#F3F3F5"/> <stop offset="0.68" stop-color="#DFDFE3"/><stop offset="1" stop-color="#C7C6CC"/></linearGradient> <linearGradient id="ios_settings-ghost" gradientUnits="userSpaceOnUse" x1="66" y1="28" x2="34" y2="74"> <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E2E2E8"/></linearGradient> <filter id="ios_settings-sh" x="-20" y="-20" width="140" height="140"><feGaussianBlur stdDeviation="1.9"/></filter> <filter id="ios_settings-sh2" x="-20" y="-20" width="140" height="140"><feGaussianBlur stdDeviation="1.1"/></filter> <filter id="ios_settings-soft" x="-20" y="-20" width="140" height="140"><feGaussianBlur stdDeviation="3.4"/></filter> <mask id="ios_settings-mk"><use href="#ios_settings-gear" fill="#fff" stroke="#fff"/></mask> <g id="ios_settings-gear" fill-rule="evenodd"><path d="M50.0,17.20A32.8,32.8 0 1,0 50.0,82.80A32.8,32.8 0 1,0 50.0,17.20ZM50.0,21.80A28.2,28.2 0 1,0 50.0,78.20A28.2,28.2 0 1,0 50.0,21.80Z" stroke="none"/><path d="M50.0,44.50A5.5,5.5 0 1,0 50.0,55.50A5.5,5.5 0 1,0 50.0,44.50ZM50.0,46.90A3.1,3.1 0 1,0 50.0,53.10A3.1,3.1 0 1,0 50.0,46.90Z" stroke="none"/><path d="M82.07,50.42C83.26,50.51 84.43,50.97 84.40,51.34L88.28,51.76A1.25,1.25 0 0,1 88.08,54.25L84.19,54.05C84.16,54.42 82.93,54.70 81.74,54.60ZM81.51,55.98C82.67,56.28 83.74,56.94 83.64,57.30L87.39,58.38A1.25,1.25 0 0,1 86.77,60.80L82.96,59.93C82.87,60.29 81.62,60.35 80.45,60.05ZM79.99,61.36C81.08,61.86 82.02,62.69 81.87,63.03L85.37,64.75A1.25,1.25 0 0,1 84.33,67.02L80.74,65.50C80.59,65.84 79.34,65.68 78.25,65.18ZM77.56,66.39C78.55,67.07 79.33,68.06 79.12,68.36L82.27,70.66A1.25,1.25 0 0,1 80.86,72.72L77.58,70.61C77.37,70.91 76.17,70.54 75.18,69.86ZM74.30,70.93C75.15,71.77 75.75,72.88 75.49,73.14L78.19,75.95A1.25,1.25 0 0,1 76.44,77.74L73.58,75.08C73.32,75.35 72.21,74.77 71.35,73.93ZM70.29,74.83C70.99,75.81 71.38,77.00 71.08,77.22L73.26,80.45A1.25,1.25 0 0,1 71.22,81.91L68.87,78.80C68.57,79.01 67.57,78.25 66.87,77.27ZM65.67,77.98C66.19,79.06 66.37,80.30 66.04,80.46L67.62,84.03A1.25,1.25 0 0,1 65.36,85.11L63.58,81.63C63.25,81.79 62.40,80.87 61.88,79.79ZM60.58,80.27C60.90,81.43 60.86,82.69 60.50,82.79L61.44,86.57A1.25,1.25 0 0,1 59.03,87.24L57.88,83.51C57.53,83.61 56.85,82.55 56.53,81.40ZM55.16,81.65C55.27,82.85 55.02,84.08 54.65,84.11L54.92,88.00A1.25,1.25 0 0,1 52.43,88.24L51.94,84.37C51.58,84.41 51.09,83.25 50.98,82.05ZM49.58,82.07C49.49,83.26 49.03,84.43 48.66,84.40L48.24,88.28A1.25,1.25 0 0,1 45.75,88.08L45.95,84.19C45.58,84.16 45.30,82.93 45.40,81.74ZM44.02,81.51C43.72,82.67 43.06,83.74 42.70,83.64L41.62,87.39A1.25,1.25 0 0,1 39.20,86.77L40.07,82.96C39.71,82.87 39.65,81.62 39.95,80.45ZM38.64,79.99C38.14,81.08 37.31,82.02 36.97,81.87L35.25,85.37A1.25,1.25 0 0,1 32.98,84.33L34.50,80.74C34.16,80.59 34.32,79.34 34.82,78.25ZM33.61,77.56C32.93,78.55 31.94,79.33 31.64,79.12L29.34,82.27A1.25,1.25 0 0,1 27.28,80.86L29.39,77.58C29.09,77.37 29.46,76.17 30.14,75.18ZM29.07,74.30C28.23,75.15 27.12,75.75 26.86,75.49L24.05,78.19A1.25,1.25 0 0,1 22.26,76.44L24.92,73.58C24.65,73.32 25.23,72.21 26.07,71.35ZM25.17,70.29C24.19,70.99 23.00,71.38 22.78,71.08L19.55,73.26A1.25,1.25 0 0,1 18.09,71.22L21.20,68.87C20.99,68.57 21.75,67.57 22.73,66.87ZM22.02,65.67C20.94,66.19 19.70,66.37 19.54,66.04L15.97,67.62A1.25,1.25 0 0,1 14.89,65.36L18.37,63.58C18.21,63.25 19.13,62.40 20.21,61.88ZM19.73,60.58C18.57,60.90 17.31,60.86 17.21,60.50L13.43,61.44A1.25,1.25 0 0,1 12.76,59.03L16.49,57.88C16.39,57.53 17.45,56.85 18.60,56.53ZM18.35,55.16C17.15,55.27 15.92,55.02 15.89,54.65L12.00,54.92A1.25,1.25 0 0,1 11.76,52.43L15.63,51.94C15.59,51.58 16.75,51.09 17.95,50.98ZM17.93,49.58C16.74,49.49 15.57,49.03 15.60,48.66L11.72,48.24A1.25,1.25 0 0,1 11.92,45.75L15.81,45.95C15.84,45.58 17.07,45.30 18.26,45.40ZM18.49,44.02C17.33,43.72 16.26,43.06 16.36,42.70L12.61,41.62A1.25,1.25 0 0,1 13.23,39.20L17.04,40.07C17.13,39.71 18.38,39.65 19.55,39.95ZM20.01,38.64C18.92,38.14 17.98,37.31 18.13,36.97L14.63,35.25A1.25,1.25 0 0,1 15.67,32.98L19.26,34.50C19.41,34.16 20.66,34.32 21.75,34.82ZM22.44,33.61C21.45,32.93 20.67,31.94 20.88,31.64L17.73,29.34A1.25,1.25 0 0,1 19.14,27.28L22.42,29.39C22.63,29.09 23.83,29.46 24.82,30.14ZM25.70,29.07C24.85,28.23 24.25,27.12 24.51,26.86L21.81,24.05A1.25,1.25 0 0,1 23.56,22.26L26.42,24.92C26.68,24.65 27.79,25.23 28.65,26.07ZM29.71,25.17C29.01,24.19 28.62,23.00 28.92,22.78L26.74,19.55A1.25,1.25 0 0,1 28.78,18.09L31.13,21.20C31.43,20.99 32.43,21.75 33.13,22.73ZM34.33,22.02C33.81,20.94 33.63,19.70 33.96,19.54L32.38,15.97A1.25,1.25 0 0,1 34.64,14.89L36.42,18.37C36.75,18.21 37.60,19.13 38.12,20.21ZM39.42,19.73C39.10,18.57 39.14,17.31 39.50,17.21L38.56,13.43A1.25,1.25 0 0,1 40.97,12.76L42.12,16.49C42.47,16.39 43.15,17.45 43.47,18.60ZM44.84,18.35C44.73,17.15 44.98,15.92 45.35,15.89L45.08,12.00A1.25,1.25 0 0,1 47.57,11.76L48.06,15.63C48.42,15.59 48.91,16.75 49.02,17.95ZM50.42,17.93C50.51,16.74 50.97,15.57 51.34,15.60L51.76,11.72A1.25,1.25 0 0,1 54.25,11.92L54.05,15.81C54.42,15.84 54.70,17.07 54.60,18.26ZM55.98,18.49C56.28,17.33 56.94,16.26 57.30,16.36L58.38,12.61A1.25,1.25 0 0,1 60.80,13.23L59.93,17.04C60.29,17.13 60.35,18.38 60.05,19.55ZM61.36,20.01C61.86,18.92 62.69,17.98 63.03,18.13L64.75,14.63A1.25,1.25 0 0,1 67.02,15.67L65.50,19.26C65.84,19.41 65.68,20.66 65.18,21.75ZM66.39,22.44C67.07,21.45 68.06,20.67 68.36,20.88L70.66,17.73A1.25,1.25 0 0,1 72.72,19.14L70.61,22.42C70.91,22.63 70.54,23.83 69.86,24.82ZM70.93,25.70C71.77,24.85 72.88,24.25 73.14,24.51L75.95,21.81A1.25,1.25 0 0,1 77.74,23.56L75.08,26.42C75.35,26.68 74.77,27.79 73.93,28.65ZM74.83,29.71C75.81,29.01 77.00,28.62 77.22,28.92L80.45,26.74A1.25,1.25 0 0,1 81.91,28.78L78.80,31.13C79.01,31.43 78.25,32.43 77.27,33.13ZM77.98,34.33C79.06,33.81 80.30,33.63 80.46,33.96L84.03,32.38A1.25,1.25 0 0,1 85.11,34.64L81.63,36.42C81.79,36.75 80.87,37.60 79.79,38.12ZM80.27,39.42C81.43,39.10 82.69,39.14 82.79,39.50L86.57,38.56A1.25,1.25 0 0,1 87.24,40.97L83.51,42.12C83.61,42.47 82.55,43.15 81.40,43.47ZM81.65,44.84C82.85,44.73 84.08,44.98 84.11,45.35L88.00,45.08A1.25,1.25 0 0,1 88.24,47.57L84.37,48.06C84.41,48.42 83.25,48.91 82.05,49.02Z" stroke="none" fill-rule="nonzero"/><path d="M56.20,49.98L79.40,49.90M46.92,55.38L35.39,75.51M46.88,44.64L35.21,24.59" fill="none" stroke-width="5.2" stroke-linecap="round"/></g> <g id="ios_settings-inner" fill-rule="evenodd"><path d="M50.0,28.90A21.1,21.1 0 1,0 50.0,71.10A21.1,21.1 0 1,0 50.0,28.90ZM50.0,32.80A17.2,17.2 0 1,0 50.0,67.20A17.2,17.2 0 1,0 50.0,32.80Z" stroke="none"/><path d="M70.50,52.91C71.13,53.06 71.72,53.38 71.68,53.55L73.72,54.47A1.30,1.30 0 0,1 73.10,56.99L70.87,56.86C70.83,57.03 70.15,57.04 69.52,56.89ZM69.05,58.11C69.62,58.42 70.10,58.89 70.02,59.04L71.75,60.45A1.30,1.30 0 0,1 70.50,62.73L68.38,62.02C68.30,62.18 67.64,62.02 67.07,61.71ZM66.30,62.76C66.77,63.21 67.12,63.79 67.00,63.92L68.31,65.73A1.30,1.30 0 0,1 66.51,67.60L64.64,66.37C64.52,66.50 63.93,66.18 63.46,65.73ZM62.44,66.55C62.78,67.10 62.96,67.75 62.81,67.84L63.61,69.93A1.30,1.30 0 0,1 61.39,71.28L59.91,69.60C59.76,69.70 59.27,69.23 58.93,68.67ZM57.73,69.20C57.91,69.83 57.93,70.50 57.76,70.55L57.99,72.77A1.30,1.30 0 0,1 55.50,73.50L54.50,71.50C54.33,71.55 53.98,70.97 53.80,70.35ZM52.50,70.55C52.51,71.20 52.35,71.85 52.18,71.86L51.83,74.07A1.30,1.30 0 0,1 49.23,74.12L48.78,71.93C48.60,71.94 48.41,71.29 48.40,70.64ZM47.09,70.50C46.94,71.13 46.62,71.72 46.45,71.68L45.53,73.72A1.30,1.30 0 0,1 43.01,73.10L43.14,70.87C42.97,70.83 42.96,70.15 43.11,69.52ZM41.89,69.05C41.58,69.62 41.11,70.10 40.96,70.02L39.55,71.75A1.30,1.30 0 0,1 37.27,70.50L37.98,68.38C37.82,68.30 37.98,67.64 38.29,67.07ZM37.24,66.30C36.79,66.77 36.21,67.12 36.08,67.00L34.27,68.31A1.30,1.30 0 0,1 32.40,66.51L33.63,64.64C33.50,64.52 33.82,63.93 34.27,63.46ZM33.45,62.44C32.90,62.78 32.25,62.96 32.16,62.81L30.07,63.61A1.30,1.30 0 0,1 28.72,61.39L30.40,59.91C30.30,59.76 30.77,59.27 31.33,58.93ZM30.80,57.73C30.17,57.91 29.50,57.93 29.45,57.76L27.23,57.99A1.30,1.30 0 0,1 26.50,55.50L28.50,54.50C28.45,54.33 29.03,53.98 29.65,53.80ZM29.45,52.50C28.80,52.51 28.15,52.35 28.14,52.18L25.93,51.83A1.30,1.30 0 0,1 25.88,49.23L28.07,48.78C28.06,48.60 28.71,48.41 29.36,48.40ZM29.50,47.09C28.87,46.94 28.28,46.62 28.32,46.45L26.28,45.53A1.30,1.30 0 0,1 26.90,43.01L29.13,43.14C29.17,42.97 29.85,42.96 30.48,43.11ZM30.95,41.89C30.38,41.58 29.90,41.11 29.98,40.96L28.25,39.55A1.30,1.30 0 0,1 29.50,37.27L31.62,37.98C31.70,37.82 32.36,37.98 32.93,38.29ZM33.70,37.24C33.23,36.79 32.88,36.21 33.00,36.08L31.69,34.27A1.30,1.30 0 0,1 33.49,32.40L35.36,33.63C35.48,33.50 36.07,33.82 36.54,34.27ZM37.56,33.45C37.22,32.90 37.04,32.25 37.19,32.16L36.39,30.07A1.30,1.30 0 0,1 38.61,28.72L40.09,30.40C40.24,30.30 40.73,30.77 41.07,31.33ZM42.27,30.80C42.09,30.17 42.07,29.50 42.24,29.45L42.01,27.23A1.30,1.30 0 0,1 44.50,26.50L45.50,28.50C45.67,28.45 46.02,29.03 46.20,29.65ZM47.50,29.45C47.49,28.80 47.65,28.15 47.82,28.14L48.17,25.93A1.30,1.30 0 0,1 50.77,25.88L51.22,28.07C51.40,28.06 51.59,28.71 51.60,29.36ZM52.91,29.50C53.06,28.87 53.38,28.28 53.55,28.32L54.47,26.28A1.30,1.30 0 0,1 56.99,26.90L56.86,29.13C57.03,29.17 57.04,29.85 56.89,30.48ZM58.11,30.95C58.42,30.38 58.89,29.90 59.04,29.98L60.45,28.25A1.30,1.30 0 0,1 62.73,29.50L62.02,31.62C62.18,31.70 62.02,32.36 61.71,32.93ZM62.76,33.70C63.21,33.23 63.79,32.88 63.92,33.00L65.73,31.69A1.30,1.30 0 0,1 67.60,33.49L66.37,35.36C66.50,35.48 66.18,36.07 65.73,36.54ZM66.55,37.56C67.10,37.22 67.75,37.04 67.84,37.19L69.93,36.39A1.30,1.30 0 0,1 71.28,38.61L69.60,40.09C69.70,40.24 69.23,40.73 68.67,41.07ZM69.20,42.27C69.83,42.09 70.50,42.07 70.55,42.24L72.77,42.01A1.30,1.30 0 0,1 73.50,44.50L71.50,45.50C71.55,45.67 70.97,46.02 70.35,46.20ZM70.55,47.50C71.20,47.49 71.85,47.65 71.86,47.82L74.07,48.17A1.30,1.30 0 0,1 74.12,50.77L71.93,51.22C71.94,51.40 71.29,51.59 70.64,51.60Z" stroke="none" fill-rule="nonzero"/></g> </defs> <rect width="100" height="100" fill="url(#ios_settings-bg)"/> <g transform="translate(0.4,1.3)" filter="url(#ios_settings-sh2)" opacity="0.13"><use href="#ios_settings-inner" fill="#000" stroke="#000"/></g> <g opacity="0.60"><use href="#ios_settings-inner" fill="url(#ios_settings-ghost)" stroke="none"/></g> <g transform="translate(0.4,1.4)" filter="url(#ios_settings-sh)" opacity="0.18"><use href="#ios_settings-gear" fill="#000" stroke="#000"/></g> <use href="#ios_settings-gear" fill="url(#ios_settings-metal)" stroke="url(#ios_settings-metal)"/> <g mask="url(#ios_settings-mk)"> <ellipse cx="30" cy="24" rx="30" ry="24" fill="#FFFFFF" opacity="0.5" filter="url(#ios_settings-soft)"/> <ellipse cx="72" cy="80" rx="30" ry="24" fill="#5C5B63" opacity="0.30" filter="url(#ios_settings-soft)"/> </g> <rect width="100" height="3.2" fill="url(#ios_settings-toprim)"/> <rect y="92" width="100" height="8" fill="url(#ios_settings-botrim)"/> </svg>`,
    svg: null,
  },
  health: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="ios_health-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".34" stop-color="#F9F9F9"/><stop offset=".72" stop-color="#F0F0F0"/><stop offset="1" stop-color="#EBEBEB"/></linearGradient><linearGradient id="ios_health-h" gradientUnits="userSpaceOnUse" x1="61.7" y1="15.9" x2="61.7" y2="57.6"><stop offset="0" stop-color="#FF63CB"/><stop offset=".06" stop-color="#FF41B2"/><stop offset=".18" stop-color="#FF339C"/><stop offset=".28" stop-color="#FF2A88"/><stop offset=".38" stop-color="#FF1E70"/><stop offset=".47" stop-color="#FF1355"/><stop offset=".60" stop-color="#FE0634"/><stop offset=".74" stop-color="#FF0221"/><stop offset=".88" stop-color="#FD0216"/><stop offset="1" stop-color="#F60113"/></linearGradient><linearGradient id="ios_health-rimfade" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="43"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#FFFFFF"/><stop offset="1" stop-color="#000000"/></linearGradient><mask id="ios_health-rimmask"><rect width="100" height="100" fill="url(#ios_health-rimfade)"/></mask><filter id="ios_health-b1" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter><filter id="ios_health-b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4.0"/></filter><filter id="ios_health-b3" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="2.6"/></filter><filter id="ios_health-b4" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="1.5"/></filter><filter id="ios_health-rimb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1"/></filter><clipPath id="ios_health-cp"><path d="M61.7 57.6C49.0 50.9 38.8 38.5 39.3 29.3C39.4 21.2 45.0 15.6 51.7 15.6C56.0 15.6 59.4 17.5 61.7 22.4C64.0 17.5 67.4 15.6 71.7 15.6C78.4 15.6 84.0 21.2 84.1 29.3C84.6 38.5 74.4 50.9 61.7 57.6Z"/></clipPath></defs><rect width="100" height="100" fill="url(#ios_health-bg)"/><path d="M100.000,50.000L99.938,65.868L99.752,71.537L99.441,75.716L99.005,79.122L98.440,82.024L97.745,84.555L96.917,86.793L95.951,88.787L94.841,90.568L93.581,92.161L92.161,93.581L90.568,94.841L88.787,95.951L86.793,96.917L84.555,97.745L82.024,98.440L79.122,99.005L75.716,99.441L71.537,99.752L65.868,99.938L50.000,100.000L34.132,99.938L28.463,99.752L24.284,99.441L20.878,99.005L17.976,98.440L15.445,97.745L13.207,96.917L11.213,95.951L9.432,94.841L7.839,93.581L6.419,92.161L5.159,90.568L4.049,88.787L3.083,86.793L2.255,84.555L1.560,82.024L0.995,79.122L0.559,75.716L0.248,71.537L0.062,65.868L0.000,50.000L0.062,34.132L0.248,28.463L0.559,24.284L0.995,20.878L1.560,17.976L2.255,15.445L3.083,13.207L4.049,11.213L5.159,9.432L6.419,7.839L7.839,6.419L9.432,5.159L11.213,4.049L13.207,3.083L15.445,2.255L17.976,1.560L20.878,0.995L24.284,0.559L28.463,0.248L34.132,0.062L50.000,0.000L65.868,0.062L71.537,0.248L75.716,0.559L79.122,0.995L82.024,1.560L84.555,2.255L86.793,3.083L88.787,4.049L90.568,5.159L92.161,6.419L93.581,7.839L94.841,9.432L95.951,11.213L96.917,13.207L97.745,15.445L98.440,17.976L99.005,20.878L99.441,24.284L99.752,28.463L99.938,34.132Z" fill="none" stroke="#FFFFFF" stroke-opacity=".97" stroke-width="4.4" filter="url(#ios_health-rimb)"/><g opacity=".12"><path d="M61.7 57.6C49.0 50.9 38.8 38.5 39.3 29.3C39.4 21.2 45.0 15.6 51.7 15.6C56.0 15.6 59.4 17.5 61.7 22.4C64.0 17.5 67.4 15.6 71.7 15.6C78.4 15.6 84.0 21.2 84.1 29.3C84.6 38.5 74.4 50.9 61.7 57.6Z" transform="translate(1.6,2.8)" fill="#FF2E86" filter="url(#ios_health-b2)"/></g><g opacity=".30"><path d="M61.7 57.6C49.0 50.9 38.8 38.5 39.3 29.3C39.4 21.2 45.0 15.6 51.7 15.6C56.0 15.6 59.4 17.5 61.7 22.4C64.0 17.5 67.4 15.6 71.7 15.6C78.4 15.6 84.0 21.2 84.1 29.3C84.6 38.5 74.4 50.9 61.7 57.6Z" transform="translate(0.7,1.7)" fill="#F52A6E" filter="url(#ios_health-b1)"/></g><path d="M61.7 57.6C49.0 50.9 38.8 38.5 39.3 29.3C39.4 21.2 45.0 15.6 51.7 15.6C56.0 15.6 59.4 17.5 61.7 22.4C64.0 17.5 67.4 15.6 71.7 15.6C78.4 15.6 84.0 21.2 84.1 29.3C84.6 38.5 74.4 50.9 61.7 57.6Z" fill="url(#ios_health-h)"/><g clip-path="url(#ios_health-cp)"><ellipse cx="61.7" cy="14.2" rx="17.0" ry="5.0" fill="#FFFFFF" opacity=".50" filter="url(#ios_health-b3)"/><ellipse cx="49.5" cy="19.5" rx="7.4" ry="4.6" transform="rotate(-32 49.5 19.5)" fill="#FFFFFF" opacity=".10" filter="url(#ios_health-b3)"/><g mask="url(#ios_health-rimmask)"><path d="M61.7 57.6C49.0 50.9 38.8 38.5 39.3 29.3C39.4 21.2 45.0 15.6 51.7 15.6C56.0 15.6 59.4 17.5 61.7 22.4C64.0 17.5 67.4 15.6 71.7 15.6C78.4 15.6 84.0 21.2 84.1 29.3C84.6 38.5 74.4 50.9 61.7 57.6Z" transform="translate(-0.55,-0.85)" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="1.7" filter="url(#ios_health-b4)"/></g><path d="M61.7 57.6C49.0 50.9 38.8 38.5 39.3 29.3C39.4 21.2 45.0 15.6 51.7 15.6C56.0 15.6 59.4 17.5 61.7 22.4C64.0 17.5 67.4 15.6 71.7 15.6C78.4 15.6 84.0 21.2 84.1 29.3C84.6 38.5 74.4 50.9 61.7 57.6Z" transform="translate(0.7,1.1)" fill="none" stroke="#C7003A" stroke-opacity=".16" stroke-width="1.6" filter="url(#ios_health-b4)"/></g></svg>`,
    svg: null,
  },
  fitness: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="ios_fitness-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#525254"/><stop offset="0.28" stop-color="#2C2C2E"/><stop offset="0.72" stop-color="#1A1A1C"/><stop offset="1" stop-color="#0E0E10"/></linearGradient><radialGradient id="ios_fitness-vig" cx="0.5" cy="0.46" r="0.72"><stop offset="0" stop-color="#000000" stop-opacity="0.45"/><stop offset="0.55" stop-color="#000000" stop-opacity="0.22"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient><linearGradient id="ios_fitness-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><linearGradient id="ios_fitness-btm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.55"/></linearGradient><filter id="ios_fitness-sh" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="2.0"/></filter><filter id="ios_fitness-b1" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="0.9"/></filter><filter id="ios_fitness-b2" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="0.45"/></filter><filter id="ios_fitness-b3" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="1.3"/></filter><linearGradient id="ios_fitness-g0-0" gradientUnits="userSpaceOnUse" x1="56.21" y1="14.79" x2="66.73" y2="18.41"><stop offset="0" stop-color="#EA3322"/><stop offset="1" stop-color="#EA3327"/></linearGradient><linearGradient id="ios_fitness-g0-1" gradientUnits="userSpaceOnUse" x1="66.73" y1="18.41" x2="75.63" y2="25.08"><stop offset="0" stop-color="#EA3327"/><stop offset="1" stop-color="#EA322C"/></linearGradient><linearGradient id="ios_fitness-g0-2" gradientUnits="userSpaceOnUse" x1="75.63" y1="25.08" x2="82.05" y2="34.16"><stop offset="0" stop-color="#EA322C"/><stop offset="1" stop-color="#EA3231"/></linearGradient><linearGradient id="ios_fitness-g0-3" gradientUnits="userSpaceOnUse" x1="82.05" y1="34.16" x2="85.37" y2="44.78"><stop offset="0" stop-color="#EA3231"/><stop offset="1" stop-color="#EA3335"/></linearGradient><linearGradient id="ios_fitness-g0-4" gradientUnits="userSpaceOnUse" x1="85.37" y1="44.78" x2="85.26" y2="55.90"><stop offset="0" stop-color="#EA3335"/><stop offset="1" stop-color="#EA333B"/></linearGradient><linearGradient id="ios_fitness-g0-5" gradientUnits="userSpaceOnUse" x1="85.26" y1="55.90" x2="81.74" y2="66.45"><stop offset="0" stop-color="#EA333B"/><stop offset="1" stop-color="#EA3344"/></linearGradient><linearGradient id="ios_fitness-g0-6" gradientUnits="userSpaceOnUse" x1="81.74" y1="66.45" x2="75.15" y2="75.41"><stop offset="0" stop-color="#EA3344"/><stop offset="1" stop-color="#EA3451"/></linearGradient><linearGradient id="ios_fitness-g0-7" gradientUnits="userSpaceOnUse" x1="75.15" y1="75.41" x2="66.12" y2="81.91"><stop offset="0" stop-color="#EA3451"/><stop offset="1" stop-color="#EA345E"/></linearGradient><linearGradient id="ios_fitness-g0-8" gradientUnits="userSpaceOnUse" x1="66.12" y1="81.91" x2="55.53" y2="85.32"><stop offset="0" stop-color="#EA345E"/><stop offset="1" stop-color="#EA3367"/></linearGradient><linearGradient id="ios_fitness-g0-9" gradientUnits="userSpaceOnUse" x1="55.53" y1="85.32" x2="44.41" y2="85.31"><stop offset="0" stop-color="#EA3367"/><stop offset="1" stop-color="#EA3370"/></linearGradient><linearGradient id="ios_fitness-g0-10" gradientUnits="userSpaceOnUse" x1="44.41" y1="85.31" x2="33.83" y2="81.88"><stop offset="0" stop-color="#EA3370"/><stop offset="1" stop-color="#EB3379"/></linearGradient><linearGradient id="ios_fitness-g0-11" gradientUnits="userSpaceOnUse" x1="33.83" y1="81.88" x2="24.81" y2="75.37"><stop offset="0" stop-color="#EB3379"/><stop offset="1" stop-color="#EB3385"/></linearGradient><linearGradient id="ios_fitness-g0-12" gradientUnits="userSpaceOnUse" x1="24.81" y1="75.37" x2="18.23" y2="66.40"><stop offset="0" stop-color="#EB3385"/><stop offset="1" stop-color="#EA3390"/></linearGradient><linearGradient id="ios_fitness-g0-13" gradientUnits="userSpaceOnUse" x1="18.23" y1="66.40" x2="14.73" y2="55.84"><stop offset="0" stop-color="#EA3390"/><stop offset="1" stop-color="#EB3393"/></linearGradient><linearGradient id="ios_fitness-g0-14" gradientUnits="userSpaceOnUse" x1="14.73" y1="55.84" x2="14.64" y2="44.72"><stop offset="0" stop-color="#EB3393"/><stop offset="1" stop-color="#EB3395"/></linearGradient><linearGradient id="ios_fitness-g0-15" gradientUnits="userSpaceOnUse" x1="14.64" y1="44.72" x2="17.98" y2="34.10"><stop offset="0" stop-color="#EB3395"/><stop offset="1" stop-color="#EB3395"/></linearGradient><linearGradient id="ios_fitness-g0-16" gradientUnits="userSpaceOnUse" x1="17.98" y1="34.10" x2="24.41" y2="25.03"><stop offset="0" stop-color="#EB3395"/><stop offset="1" stop-color="#EB3395"/></linearGradient><linearGradient id="ios_fitness-g0-17" gradientUnits="userSpaceOnUse" x1="24.41" y1="25.03" x2="33.33" y2="18.38"><stop offset="0" stop-color="#EB3395"/><stop offset="1" stop-color="#EB3395"/></linearGradient><linearGradient id="ios_fitness-g0-18" gradientUnits="userSpaceOnUse" x1="33.33" y1="18.38" x2="43.85" y2="14.78"><stop offset="0" stop-color="#EB3395"/><stop offset="1" stop-color="#EB3395"/></linearGradient><linearGradient id="ios_fitness-g0-19" gradientUnits="userSpaceOnUse" x1="43.85" y1="14.78" x2="54.98" y2="14.60"><stop offset="0" stop-color="#EB3395"/><stop offset="1" stop-color="#EB3395"/></linearGradient><linearGradient id="ios_fitness-g1-0" gradientUnits="userSpaceOnUse" x1="54.24" y1="25.97" x2="61.42" y2="28.44"><stop offset="0" stop-color="#99FA4C"/><stop offset="1" stop-color="#9DFB4D"/></linearGradient><linearGradient id="ios_fitness-g1-1" gradientUnits="userSpaceOnUse" x1="61.42" y1="28.44" x2="67.49" y2="32.99"><stop offset="0" stop-color="#9DFB4D"/><stop offset="1" stop-color="#A1FB4D"/></linearGradient><linearGradient id="ios_fitness-g1-2" gradientUnits="userSpaceOnUse" x1="67.49" y1="32.99" x2="71.87" y2="39.19"><stop offset="0" stop-color="#A1FB4D"/><stop offset="1" stop-color="#A4FC4E"/></linearGradient><linearGradient id="ios_fitness-g1-3" gradientUnits="userSpaceOnUse" x1="71.87" y1="39.19" x2="74.14" y2="46.44"><stop offset="0" stop-color="#A4FC4E"/><stop offset="1" stop-color="#A5FB4E"/></linearGradient><linearGradient id="ios_fitness-g1-4" gradientUnits="userSpaceOnUse" x1="74.14" y1="46.44" x2="74.07" y2="54.03"><stop offset="0" stop-color="#A5FB4E"/><stop offset="1" stop-color="#A7FB4E"/></linearGradient><linearGradient id="ios_fitness-g1-5" gradientUnits="userSpaceOnUse" x1="74.07" y1="54.03" x2="71.66" y2="61.23"><stop offset="0" stop-color="#A7FB4E"/><stop offset="1" stop-color="#AAFC4F"/></linearGradient><linearGradient id="ios_fitness-g1-6" gradientUnits="userSpaceOnUse" x1="71.66" y1="61.23" x2="67.16" y2="67.34"><stop offset="0" stop-color="#AAFC4F"/><stop offset="1" stop-color="#AFFD50"/></linearGradient><linearGradient id="ios_fitness-g1-7" gradientUnits="userSpaceOnUse" x1="67.16" y1="67.34" x2="61.00" y2="71.78"><stop offset="0" stop-color="#AFFD50"/><stop offset="1" stop-color="#B3FD50"/></linearGradient><linearGradient id="ios_fitness-g1-8" gradientUnits="userSpaceOnUse" x1="61.00" y1="71.78" x2="53.77" y2="74.11"><stop offset="0" stop-color="#B3FD50"/><stop offset="1" stop-color="#B6FD4F"/></linearGradient><linearGradient id="ios_fitness-g1-9" gradientUnits="userSpaceOnUse" x1="53.77" y1="74.11" x2="46.18" y2="74.10"><stop offset="0" stop-color="#B6FD4F"/><stop offset="1" stop-color="#B9FD4F"/></linearGradient><linearGradient id="ios_fitness-g1-10" gradientUnits="userSpaceOnUse" x1="46.18" y1="74.10" x2="38.96" y2="71.76"><stop offset="0" stop-color="#B9FD4F"/><stop offset="1" stop-color="#BCFD4F"/></linearGradient><linearGradient id="ios_fitness-g1-11" gradientUnits="userSpaceOnUse" x1="38.96" y1="71.76" x2="32.81" y2="67.31"><stop offset="0" stop-color="#BCFD4F"/><stop offset="1" stop-color="#C0FD4F"/></linearGradient><linearGradient id="ios_fitness-g1-12" gradientUnits="userSpaceOnUse" x1="32.81" y1="67.31" x2="28.32" y2="61.19"><stop offset="0" stop-color="#C0FD4F"/><stop offset="1" stop-color="#C4FC50"/></linearGradient><linearGradient id="ios_fitness-g1-13" gradientUnits="userSpaceOnUse" x1="28.32" y1="61.19" x2="25.93" y2="53.99"><stop offset="0" stop-color="#C4FC50"/><stop offset="1" stop-color="#C7FC4F"/></linearGradient><linearGradient id="ios_fitness-g1-14" gradientUnits="userSpaceOnUse" x1="25.93" y1="53.99" x2="25.87" y2="46.39"><stop offset="0" stop-color="#C7FC4F"/><stop offset="1" stop-color="#C9FC50"/></linearGradient><linearGradient id="ios_fitness-g1-15" gradientUnits="userSpaceOnUse" x1="25.87" y1="46.39" x2="28.14" y2="39.15"><stop offset="0" stop-color="#C9FC50"/><stop offset="1" stop-color="#CCFD51"/></linearGradient><linearGradient id="ios_fitness-g1-16" gradientUnits="userSpaceOnUse" x1="28.14" y1="39.15" x2="32.54" y2="32.96"><stop offset="0" stop-color="#CCFD51"/><stop offset="1" stop-color="#D1FD51"/></linearGradient><linearGradient id="ios_fitness-g1-17" gradientUnits="userSpaceOnUse" x1="32.54" y1="32.96" x2="38.62" y2="28.42"><stop offset="0" stop-color="#D1FD51"/><stop offset="1" stop-color="#D6FE50"/></linearGradient><linearGradient id="ios_fitness-g1-18" gradientUnits="userSpaceOnUse" x1="38.62" y1="28.42" x2="45.80" y2="25.96"><stop offset="0" stop-color="#D6FE50"/><stop offset="1" stop-color="#DAFF51"/></linearGradient><linearGradient id="ios_fitness-g1-19" gradientUnits="userSpaceOnUse" x1="45.80" y1="25.96" x2="53.40" y2="25.84"><stop offset="0" stop-color="#DAFF51"/><stop offset="1" stop-color="#DEFF52"/></linearGradient><linearGradient id="ios_fitness-g2-0" gradientUnits="userSpaceOnUse" x1="52.27" y1="37.10" x2="56.13" y2="38.42"><stop offset="0" stop-color="#64D9EC"/><stop offset="1" stop-color="#66DDEE"/></linearGradient><linearGradient id="ios_fitness-g2-1" gradientUnits="userSpaceOnUse" x1="56.13" y1="38.42" x2="59.39" y2="40.87"><stop offset="0" stop-color="#66DDEE"/><stop offset="1" stop-color="#68E1F0"/></linearGradient><linearGradient id="ios_fitness-g2-2" gradientUnits="userSpaceOnUse" x1="59.39" y1="40.87" x2="61.74" y2="44.20"><stop offset="0" stop-color="#68E1F0"/><stop offset="1" stop-color="#6EEDF6"/></linearGradient><linearGradient id="ios_fitness-g2-3" gradientUnits="userSpaceOnUse" x1="61.74" y1="44.20" x2="62.96" y2="48.09"><stop offset="0" stop-color="#6EEDF6"/><stop offset="1" stop-color="#6FF0F6"/></linearGradient><linearGradient id="ios_fitness-g2-4" gradientUnits="userSpaceOnUse" x1="62.96" y1="48.09" x2="62.92" y2="52.16"><stop offset="0" stop-color="#6FF0F6"/><stop offset="1" stop-color="#71F3F5"/></linearGradient><linearGradient id="ios_fitness-g2-5" gradientUnits="userSpaceOnUse" x1="62.92" y1="52.16" x2="61.63" y2="56.03"><stop offset="0" stop-color="#71F3F5"/><stop offset="1" stop-color="#72F6F4"/></linearGradient><linearGradient id="ios_fitness-g2-6" gradientUnits="userSpaceOnUse" x1="61.63" y1="56.03" x2="59.21" y2="59.31"><stop offset="0" stop-color="#72F6F4"/><stop offset="1" stop-color="#74F9F2"/></linearGradient><linearGradient id="ios_fitness-g2-7" gradientUnits="userSpaceOnUse" x1="59.21" y1="59.31" x2="55.91" y2="61.69"><stop offset="0" stop-color="#74F9F2"/><stop offset="1" stop-color="#75FBEF"/></linearGradient><linearGradient id="ios_fitness-g2-8" gradientUnits="userSpaceOnUse" x1="55.91" y1="61.69" x2="52.03" y2="62.94"><stop offset="0" stop-color="#75FBEF"/><stop offset="1" stop-color="#75FBE7"/></linearGradient><linearGradient id="ios_fitness-g2-9" gradientUnits="userSpaceOnUse" x1="52.03" y1="62.94" x2="47.95" y2="62.94"><stop offset="0" stop-color="#75FBE7"/><stop offset="1" stop-color="#75FBE0"/></linearGradient><linearGradient id="ios_fitness-g2-10" gradientUnits="userSpaceOnUse" x1="47.95" y1="62.94" x2="44.07" y2="61.68"><stop offset="0" stop-color="#75FBE0"/><stop offset="1" stop-color="#75FBD9"/></linearGradient><linearGradient id="ios_fitness-g2-11" gradientUnits="userSpaceOnUse" x1="44.07" y1="61.68" x2="40.77" y2="59.30"><stop offset="0" stop-color="#75FBD9"/><stop offset="1" stop-color="#75FBCE"/></linearGradient><linearGradient id="ios_fitness-g2-12" gradientUnits="userSpaceOnUse" x1="40.77" y1="59.30" x2="38.36" y2="56.01"><stop offset="0" stop-color="#75FBCE"/><stop offset="1" stop-color="#76FBC3"/></linearGradient><linearGradient id="ios_fitness-g2-13" gradientUnits="userSpaceOnUse" x1="38.36" y1="56.01" x2="37.08" y2="52.14"><stop offset="0" stop-color="#76FBC3"/><stop offset="1" stop-color="#75FABC"/></linearGradient><linearGradient id="ios_fitness-g2-14" gradientUnits="userSpaceOnUse" x1="37.08" y1="52.14" x2="37.04" y2="48.06"><stop offset="0" stop-color="#75FABC"/><stop offset="1" stop-color="#75FAB5"/></linearGradient><linearGradient id="ios_fitness-g2-15" gradientUnits="userSpaceOnUse" x1="37.04" y1="48.06" x2="38.27" y2="44.18"><stop offset="0" stop-color="#75FAB5"/><stop offset="1" stop-color="#74FBAD"/></linearGradient><linearGradient id="ios_fitness-g2-16" gradientUnits="userSpaceOnUse" x1="38.27" y1="44.18" x2="40.62" y2="40.85"><stop offset="0" stop-color="#74FBAD"/><stop offset="1" stop-color="#74FBAC"/></linearGradient><linearGradient id="ios_fitness-g2-17" gradientUnits="userSpaceOnUse" x1="40.62" y1="40.85" x2="43.89" y2="38.41"><stop offset="0" stop-color="#74FBAC"/><stop offset="1" stop-color="#74FBAC"/></linearGradient><linearGradient id="ios_fitness-g2-18" gradientUnits="userSpaceOnUse" x1="43.89" y1="38.41" x2="47.75" y2="37.10"><stop offset="0" stop-color="#74FBAC"/><stop offset="1" stop-color="#74FBAC"/></linearGradient><linearGradient id="ios_fitness-g2-19" gradientUnits="userSpaceOnUse" x1="47.75" y1="37.10" x2="51.82" y2="37.03"><stop offset="0" stop-color="#74FBAC"/><stop offset="1" stop-color="#74FBAC"/></linearGradient></defs><rect width="100" height="100" fill="url(#ios_fitness-bg)"/><rect width="100" height="100" fill="url(#ios_fitness-vig)"/><rect x="0" y="0" width="100" height="5" fill="url(#ios_fitness-rim)"/><rect x="0" y="92" width="100" height="8" fill="url(#ios_fitness-btm)"/><g filter="url(#ios_fitness-sh)" opacity="0.45"><path d="M56.21 14.79 A35.75 35.75 0 0 1 85.26 55.90 A35.75 35.75 0 0 1 44.41 85.31 A35.75 35.75 0 0 1 14.64 44.72 A35.75 35.75 0 0 1 54.98 14.60" fill="none" stroke="#000000" stroke-width="8.60" stroke-linecap="round" transform="translate(0.4 2.2)"/><path d="M54.24 25.97 A24.40 24.40 0 0 1 74.07 54.03 A24.40 24.40 0 0 1 46.18 74.10 A24.40 24.40 0 0 1 25.87 46.39 A24.40 24.40 0 0 1 53.40 25.84" fill="none" stroke="#000000" stroke-width="8.60" stroke-linecap="round" transform="translate(0.4 2.2)"/><path d="M52.27 37.10 A13.10 13.10 0 0 1 62.92 52.16 A13.10 13.10 0 0 1 47.95 62.94 A13.10 13.10 0 0 1 37.04 48.06 A13.10 13.10 0 0 1 51.82 37.03" fill="none" stroke="#000000" stroke-width="8.60" stroke-linecap="round" transform="translate(0.4 2.2)"/></g><g><path d="M56.21 14.79 A35.75 35.75 0 0 1 66.73 18.41" fill="none" stroke="url(#ios_fitness-g0-0)" stroke-width="8.60" stroke-linecap="round"/><path d="M66.73 18.41 A35.75 35.75 0 0 1 75.63 25.08" fill="none" stroke="url(#ios_fitness-g0-1)" stroke-width="8.60" stroke-linecap="round"/><path d="M75.63 25.08 A35.75 35.75 0 0 1 82.05 34.16" fill="none" stroke="url(#ios_fitness-g0-2)" stroke-width="8.60" stroke-linecap="round"/><path d="M82.05 34.16 A35.75 35.75 0 0 1 85.37 44.78" fill="none" stroke="url(#ios_fitness-g0-3)" stroke-width="8.60" stroke-linecap="round"/><path d="M85.37 44.78 A35.75 35.75 0 0 1 85.26 55.90" fill="none" stroke="url(#ios_fitness-g0-4)" stroke-width="8.60" stroke-linecap="round"/><path d="M85.26 55.90 A35.75 35.75 0 0 1 81.74 66.45" fill="none" stroke="url(#ios_fitness-g0-5)" stroke-width="8.60" stroke-linecap="round"/><path d="M81.74 66.45 A35.75 35.75 0 0 1 75.15 75.41" fill="none" stroke="url(#ios_fitness-g0-6)" stroke-width="8.60" stroke-linecap="round"/><path d="M75.15 75.41 A35.75 35.75 0 0 1 66.12 81.91" fill="none" stroke="url(#ios_fitness-g0-7)" stroke-width="8.60" stroke-linecap="round"/><path d="M66.12 81.91 A35.75 35.75 0 0 1 55.53 85.32" fill="none" stroke="url(#ios_fitness-g0-8)" stroke-width="8.60" stroke-linecap="round"/><path d="M55.53 85.32 A35.75 35.75 0 0 1 44.41 85.31" fill="none" stroke="url(#ios_fitness-g0-9)" stroke-width="8.60" stroke-linecap="round"/><path d="M44.41 85.31 A35.75 35.75 0 0 1 33.83 81.88" fill="none" stroke="url(#ios_fitness-g0-10)" stroke-width="8.60" stroke-linecap="round"/><path d="M33.83 81.88 A35.75 35.75 0 0 1 24.81 75.37" fill="none" stroke="url(#ios_fitness-g0-11)" stroke-width="8.60" stroke-linecap="round"/><path d="M24.81 75.37 A35.75 35.75 0 0 1 18.23 66.40" fill="none" stroke="url(#ios_fitness-g0-12)" stroke-width="8.60" stroke-linecap="round"/><path d="M18.23 66.40 A35.75 35.75 0 0 1 14.73 55.84" fill="none" stroke="url(#ios_fitness-g0-13)" stroke-width="8.60" stroke-linecap="round"/><path d="M14.73 55.84 A35.75 35.75 0 0 1 14.64 44.72" fill="none" stroke="url(#ios_fitness-g0-14)" stroke-width="8.60" stroke-linecap="round"/><path d="M14.64 44.72 A35.75 35.75 0 0 1 17.98 34.10" fill="none" stroke="url(#ios_fitness-g0-15)" stroke-width="8.60" stroke-linecap="round"/><path d="M17.98 34.10 A35.75 35.75 0 0 1 24.41 25.03" fill="none" stroke="url(#ios_fitness-g0-16)" stroke-width="8.60" stroke-linecap="round"/><path d="M24.41 25.03 A35.75 35.75 0 0 1 33.33 18.38" fill="none" stroke="url(#ios_fitness-g0-17)" stroke-width="8.60" stroke-linecap="round"/><path d="M33.33 18.38 A35.75 35.75 0 0 1 43.85 14.78" fill="none" stroke="url(#ios_fitness-g0-18)" stroke-width="8.60" stroke-linecap="round"/><path d="M43.85 14.78 A35.75 35.75 0 0 1 54.98 14.60" fill="none" stroke="url(#ios_fitness-g0-19)" stroke-width="8.60" stroke-linecap="round"/><path d="M57.13 14.97 A35.75 35.75 0 0 1 61.05 16.00" fill="none" stroke="#000000" stroke-opacity="0.30" stroke-width="8.60" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M35.52 17.32 A35.75 35.75 0 0 1 54.98 14.60" fill="none" stroke="#EB3395" stroke-width="8.60" stroke-linecap="round"/><path d="M16.44 47.06 A33.69 33.69 0 0 1 35.76 19.47 A33.69 33.69 0 0 1 69.32 22.41" fill="none" stroke="#FFFFFF" stroke-opacity="0.17" stroke-width="2.41" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M11.02 45.90 A39.19 39.19 0 0 1 35.96 13.41 A39.19 39.19 0 0 1 76.22 20.88" fill="none" stroke="#FFFFFF" stroke-opacity="0.48" stroke-width="1.29" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M81.21 41.64 A32.31 32.31 0 0 1 71.83 73.82 A32.31 32.31 0 0 1 38.95 80.36" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1.12" stroke-linecap="round" filter="url(#ios_fitness-b2)"/><path d="M86.78 61.95 A38.67 38.67 0 0 1 54.04 88.46 A38.67 38.67 0 0 1 16.51 69.34" fill="none" stroke="#000000" stroke-opacity="0.15" stroke-width="2.92" stroke-linecap="round" filter="url(#ios_fitness-b3)"/></g><g><path d="M54.24 25.97 A24.40 24.40 0 0 1 61.42 28.44" fill="none" stroke="url(#ios_fitness-g1-0)" stroke-width="8.60" stroke-linecap="round"/><path d="M61.42 28.44 A24.40 24.40 0 0 1 67.49 32.99" fill="none" stroke="url(#ios_fitness-g1-1)" stroke-width="8.60" stroke-linecap="round"/><path d="M67.49 32.99 A24.40 24.40 0 0 1 71.87 39.19" fill="none" stroke="url(#ios_fitness-g1-2)" stroke-width="8.60" stroke-linecap="round"/><path d="M71.87 39.19 A24.40 24.40 0 0 1 74.14 46.44" fill="none" stroke="url(#ios_fitness-g1-3)" stroke-width="8.60" stroke-linecap="round"/><path d="M74.14 46.44 A24.40 24.40 0 0 1 74.07 54.03" fill="none" stroke="url(#ios_fitness-g1-4)" stroke-width="8.60" stroke-linecap="round"/><path d="M74.07 54.03 A24.40 24.40 0 0 1 71.66 61.23" fill="none" stroke="url(#ios_fitness-g1-5)" stroke-width="8.60" stroke-linecap="round"/><path d="M71.66 61.23 A24.40 24.40 0 0 1 67.16 67.34" fill="none" stroke="url(#ios_fitness-g1-6)" stroke-width="8.60" stroke-linecap="round"/><path d="M67.16 67.34 A24.40 24.40 0 0 1 61.00 71.78" fill="none" stroke="url(#ios_fitness-g1-7)" stroke-width="8.60" stroke-linecap="round"/><path d="M61.00 71.78 A24.40 24.40 0 0 1 53.77 74.11" fill="none" stroke="url(#ios_fitness-g1-8)" stroke-width="8.60" stroke-linecap="round"/><path d="M53.77 74.11 A24.40 24.40 0 0 1 46.18 74.10" fill="none" stroke="url(#ios_fitness-g1-9)" stroke-width="8.60" stroke-linecap="round"/><path d="M46.18 74.10 A24.40 24.40 0 0 1 38.96 71.76" fill="none" stroke="url(#ios_fitness-g1-10)" stroke-width="8.60" stroke-linecap="round"/><path d="M38.96 71.76 A24.40 24.40 0 0 1 32.81 67.31" fill="none" stroke="url(#ios_fitness-g1-11)" stroke-width="8.60" stroke-linecap="round"/><path d="M32.81 67.31 A24.40 24.40 0 0 1 28.32 61.19" fill="none" stroke="url(#ios_fitness-g1-12)" stroke-width="8.60" stroke-linecap="round"/><path d="M28.32 61.19 A24.40 24.40 0 0 1 25.93 53.99" fill="none" stroke="url(#ios_fitness-g1-13)" stroke-width="8.60" stroke-linecap="round"/><path d="M25.93 53.99 A24.40 24.40 0 0 1 25.87 46.39" fill="none" stroke="url(#ios_fitness-g1-14)" stroke-width="8.60" stroke-linecap="round"/><path d="M25.87 46.39 A24.40 24.40 0 0 1 28.14 39.15" fill="none" stroke="url(#ios_fitness-g1-15)" stroke-width="8.60" stroke-linecap="round"/><path d="M28.14 39.15 A24.40 24.40 0 0 1 32.54 32.96" fill="none" stroke="url(#ios_fitness-g1-16)" stroke-width="8.60" stroke-linecap="round"/><path d="M32.54 32.96 A24.40 24.40 0 0 1 38.62 28.42" fill="none" stroke="url(#ios_fitness-g1-17)" stroke-width="8.60" stroke-linecap="round"/><path d="M38.62 28.42 A24.40 24.40 0 0 1 45.80 25.96" fill="none" stroke="url(#ios_fitness-g1-18)" stroke-width="8.60" stroke-linecap="round"/><path d="M45.80 25.96 A24.40 24.40 0 0 1 53.40 25.84" fill="none" stroke="url(#ios_fitness-g1-19)" stroke-width="8.60" stroke-linecap="round"/><path d="M54.86 26.09 A24.40 24.40 0 0 1 57.54 26.79" fill="none" stroke="#000000" stroke-opacity="0.30" stroke-width="8.60" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M40.11 27.69 A24.40 24.40 0 0 1 53.40 25.84" fill="none" stroke="#DEFF52" stroke-width="8.60" stroke-linecap="round"/><path d="M27.75 48.05 A22.34 22.34 0 0 1 40.56 29.76 A22.34 22.34 0 0 1 62.81 31.70" fill="none" stroke="#FFFFFF" stroke-opacity="0.17" stroke-width="2.41" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M22.31 47.09 A27.84 27.84 0 0 1 40.02 24.01 A27.84 27.84 0 0 1 68.63 29.31" fill="none" stroke="#FFFFFF" stroke-opacity="0.48" stroke-width="1.29" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M70.25 44.58 A20.96 20.96 0 0 1 64.16 65.45 A20.96 20.96 0 0 1 42.83 69.70" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1.12" stroke-linecap="round" filter="url(#ios_fitness-b2)"/><path d="M75.99 58.44 A27.32 27.32 0 0 1 52.86 77.17 A27.32 27.32 0 0 1 26.34 63.66" fill="none" stroke="#000000" stroke-opacity="0.15" stroke-width="2.92" stroke-linecap="round" filter="url(#ios_fitness-b3)"/></g><g><path d="M52.27 37.10 A13.10 13.10 0 0 1 56.13 38.42" fill="none" stroke="url(#ios_fitness-g2-0)" stroke-width="8.60" stroke-linecap="round"/><path d="M56.13 38.42 A13.10 13.10 0 0 1 59.39 40.87" fill="none" stroke="url(#ios_fitness-g2-1)" stroke-width="8.60" stroke-linecap="round"/><path d="M59.39 40.87 A13.10 13.10 0 0 1 61.74 44.20" fill="none" stroke="url(#ios_fitness-g2-2)" stroke-width="8.60" stroke-linecap="round"/><path d="M61.74 44.20 A13.10 13.10 0 0 1 62.96 48.09" fill="none" stroke="url(#ios_fitness-g2-3)" stroke-width="8.60" stroke-linecap="round"/><path d="M62.96 48.09 A13.10 13.10 0 0 1 62.92 52.16" fill="none" stroke="url(#ios_fitness-g2-4)" stroke-width="8.60" stroke-linecap="round"/><path d="M62.92 52.16 A13.10 13.10 0 0 1 61.63 56.03" fill="none" stroke="url(#ios_fitness-g2-5)" stroke-width="8.60" stroke-linecap="round"/><path d="M61.63 56.03 A13.10 13.10 0 0 1 59.21 59.31" fill="none" stroke="url(#ios_fitness-g2-6)" stroke-width="8.60" stroke-linecap="round"/><path d="M59.21 59.31 A13.10 13.10 0 0 1 55.91 61.69" fill="none" stroke="url(#ios_fitness-g2-7)" stroke-width="8.60" stroke-linecap="round"/><path d="M55.91 61.69 A13.10 13.10 0 0 1 52.03 62.94" fill="none" stroke="url(#ios_fitness-g2-8)" stroke-width="8.60" stroke-linecap="round"/><path d="M52.03 62.94 A13.10 13.10 0 0 1 47.95 62.94" fill="none" stroke="url(#ios_fitness-g2-9)" stroke-width="8.60" stroke-linecap="round"/><path d="M47.95 62.94 A13.10 13.10 0 0 1 44.07 61.68" fill="none" stroke="url(#ios_fitness-g2-10)" stroke-width="8.60" stroke-linecap="round"/><path d="M44.07 61.68 A13.10 13.10 0 0 1 40.77 59.30" fill="none" stroke="url(#ios_fitness-g2-11)" stroke-width="8.60" stroke-linecap="round"/><path d="M40.77 59.30 A13.10 13.10 0 0 1 38.36 56.01" fill="none" stroke="url(#ios_fitness-g2-12)" stroke-width="8.60" stroke-linecap="round"/><path d="M38.36 56.01 A13.10 13.10 0 0 1 37.08 52.14" fill="none" stroke="url(#ios_fitness-g2-13)" stroke-width="8.60" stroke-linecap="round"/><path d="M37.08 52.14 A13.10 13.10 0 0 1 37.04 48.06" fill="none" stroke="url(#ios_fitness-g2-14)" stroke-width="8.60" stroke-linecap="round"/><path d="M37.04 48.06 A13.10 13.10 0 0 1 38.27 44.18" fill="none" stroke="url(#ios_fitness-g2-15)" stroke-width="8.60" stroke-linecap="round"/><path d="M38.27 44.18 A13.10 13.10 0 0 1 40.62 40.85" fill="none" stroke="url(#ios_fitness-g2-16)" stroke-width="8.60" stroke-linecap="round"/><path d="M40.62 40.85 A13.10 13.10 0 0 1 43.89 38.41" fill="none" stroke="url(#ios_fitness-g2-17)" stroke-width="8.60" stroke-linecap="round"/><path d="M43.89 38.41 A13.10 13.10 0 0 1 47.75 37.10" fill="none" stroke="url(#ios_fitness-g2-18)" stroke-width="8.60" stroke-linecap="round"/><path d="M47.75 37.10 A13.10 13.10 0 0 1 51.82 37.03" fill="none" stroke="url(#ios_fitness-g2-19)" stroke-width="8.60" stroke-linecap="round"/><path d="M52.61 37.16 A13.10 13.10 0 0 1 54.05 37.54" fill="none" stroke="#000000" stroke-opacity="0.30" stroke-width="8.60" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M44.69 38.02 A13.10 13.10 0 0 1 51.82 37.03" fill="none" stroke="#74FBAC" stroke-width="8.60" stroke-linecap="round"/><path d="M39.01 49.04 A11.04 11.04 0 0 1 45.34 40.00 A11.04 11.04 0 0 1 56.33 40.96" fill="none" stroke="#FFFFFF" stroke-opacity="0.17" stroke-width="2.41" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M33.55 48.27 A16.54 16.54 0 0 1 44.07 34.56 A16.54 16.54 0 0 1 61.07 37.71" fill="none" stroke="#FFFFFF" stroke-opacity="0.48" stroke-width="1.29" stroke-linecap="round" filter="url(#ios_fitness-b1)"/><path d="M59.33 47.50 A9.66 9.66 0 0 1 56.53 57.12 A9.66 9.66 0 0 1 46.70 59.08" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1.12" stroke-linecap="round" filter="url(#ios_fitness-b2)"/><path d="M65.24 54.95 A16.02 16.02 0 0 1 51.67 65.94 A16.02 16.02 0 0 1 36.12 58.01" fill="none" stroke="#000000" stroke-opacity="0.15" stroke-width="2.92" stroke-linecap="round" filter="url(#ios_fitness-b3)"/></g></svg>`,
    svg: null,
  },
  notes: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ios_notes-paper" x1="0" y1="28" x2="0" y2="97" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FBFBFB"/><stop offset="1" stop-color="#EAEAEA"/></linearGradient><linearGradient id="ios_notes-band" x1="0" y1="0" x2="0" y2="25.2" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFB90"/><stop offset="0.023" stop-color="#FFF078"/><stop offset="0.062" stop-color="#FFE150"/><stop offset="0.093" stop-color="#FFD73A"/><stop offset="0.202" stop-color="#FFD531"/><stop offset="0.318" stop-color="#FFD52C"/><stop offset="0.635" stop-color="#FFD52C"/><stop offset="0.914" stop-color="#FFDD3B"/><stop offset="0.953" stop-color="#FFE244"/><stop offset="1" stop-color="#FFE566"/></linearGradient><linearGradient id="ios_notes-glow" x1="0" y1="25.2" x2="0" y2="31.6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FCE9A5"/><stop offset="0.122" stop-color="#FCECB4"/><stop offset="0.244" stop-color="#FBF1C5"/><stop offset="0.519" stop-color="#FAF6E6"/><stop offset="0.702" stop-color="#FCFAF6"/><stop offset="0.885" stop-color="#FAFAFA"/><stop offset="1" stop-color="#FAFAFA" stop-opacity="0"/></linearGradient><linearGradient id="ios_notes-dot" x1="0" y1="27.05" x2="0" y2="29.45" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#BEB593"/><stop offset="0.55" stop-color="#C1BCAE"/><stop offset="1" stop-color="#C5C3BC"/></linearGradient><linearGradient id="ios_notes-foot" x1="0" y1="97.4" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.25" stop-color="#FFFFFF" stop-opacity="0.12"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.33"/><stop offset="0.75" stop-color="#FFFFFF" stop-opacity="0.62"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="1"/></linearGradient><linearGradient id="ios_notes-side" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="0.09" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.91" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.06"/></linearGradient></defs><rect width="100" height="100" fill="url(#ios_notes-paper)"/><rect x="0" y="97.4" width="100" height="2.6" fill="url(#ios_notes-foot)"/><rect x="0" y="0" width="100" height="25.2" fill="url(#ios_notes-band)"/><rect x="0" y="25.2" width="100" height="6.4" fill="url(#ios_notes-glow)"/><rect x="0" y="0" width="100" height="25.2" fill="url(#ios_notes-side)"/><g fill="url(#ios_notes-dot)"><circle cx="6.18" cy="28.27" r="1.22"/><circle cx="12.47" cy="28.27" r="1.22"/><circle cx="18.76" cy="28.27" r="1.22"/><circle cx="25.05" cy="28.27" r="1.22"/><circle cx="31.34" cy="28.27" r="1.22"/><circle cx="37.63" cy="28.27" r="1.22"/><circle cx="43.92" cy="28.27" r="1.22"/><circle cx="50.21" cy="28.27" r="1.22"/><circle cx="56.50" cy="28.27" r="1.22"/><circle cx="62.79" cy="28.27" r="1.22"/><circle cx="69.08" cy="28.27" r="1.22"/><circle cx="75.37" cy="28.27" r="1.22"/><circle cx="81.66" cy="28.27" r="1.22"/><circle cx="87.95" cy="28.27" r="1.22"/><circle cx="94.24" cy="28.27" r="1.22"/></g><g fill="#C1C1C1"><rect x="12.52" y="49.02" width="74.96" height="1.78" rx="0.89"/><rect x="12.52" y="74.02" width="74.96" height="1.78" rx="0.89"/></g></svg>`,
    svg: null,
  },
  reminders: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ios_reminders-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.62" stop-color="#FCFCFD"/><stop offset="1" stop-color="#F0F0F2"/></linearGradient><radialGradient id="ios_reminders-vig" cx="0.3" cy="0.16" r="0.9"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="0.65" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient><linearGradient id="ios_reminders-rimT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><linearGradient id="ios_reminders-rimB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.055"/></linearGradient><linearGradient id="ios_reminders-line" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9C9CC"/><stop offset="1" stop-color="#BBBBBF"/></linearGradient><filter id="ios_reminders-sh" x="-70%" y="-70%" width="240%" height="260%"><feGaussianBlur stdDeviation="1.4"/></filter><filter id="ios_reminders-spec" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="1.2"/></filter><radialGradient id="ios_reminders-halo-b" cx="0.5" cy="0.5" r="0.5"><stop offset="0.28" stop-color="#78ADFA" stop-opacity="0.42"/><stop offset="0.54" stop-color="#78ADFA" stop-opacity="0.34"/><stop offset="0.75" stop-color="#78ADFA" stop-opacity="0.21"/><stop offset="0.90" stop-color="#78ADFA" stop-opacity="0.07"/><stop offset="1" stop-color="#78ADFA" stop-opacity="0"/></radialGradient><linearGradient id="ios_reminders-core-b" x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#63A2F8"/><stop offset="1" stop-color="#2C74E4"/></linearGradient><clipPath id="ios_reminders-clip-b"><circle cx="21" cy="25" r="6.25"/></clipPath><radialGradient id="ios_reminders-halo-r" cx="0.5" cy="0.5" r="0.5"><stop offset="0.28" stop-color="#FB7C71" stop-opacity="0.42"/><stop offset="0.54" stop-color="#FB7C71" stop-opacity="0.34"/><stop offset="0.75" stop-color="#FB7C71" stop-opacity="0.21"/><stop offset="0.90" stop-color="#FB7C71" stop-opacity="0.07"/><stop offset="1" stop-color="#FB7C71" stop-opacity="0"/></radialGradient><linearGradient id="ios_reminders-core-r" x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#FF6E62"/><stop offset="1" stop-color="#EE2A24"/></linearGradient><clipPath id="ios_reminders-clip-r"><circle cx="21" cy="50" r="6.25"/></clipPath><radialGradient id="ios_reminders-halo-o" cx="0.5" cy="0.5" r="0.5"><stop offset="0.28" stop-color="#FCB845" stop-opacity="0.42"/><stop offset="0.54" stop-color="#FCB845" stop-opacity="0.34"/><stop offset="0.75" stop-color="#FCB845" stop-opacity="0.21"/><stop offset="0.90" stop-color="#FCB845" stop-opacity="0.07"/><stop offset="1" stop-color="#FCB845" stop-opacity="0"/></radialGradient><linearGradient id="ios_reminders-core-o" x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#FFBB3C"/><stop offset="1" stop-color="#EF8600"/></linearGradient><clipPath id="ios_reminders-clip-o"><circle cx="21" cy="75" r="6.25"/></clipPath></defs><rect width="100" height="100" fill="url(#ios_reminders-bg)"/><rect width="100" height="100" fill="url(#ios_reminders-vig)"/><rect width="100" height="4" fill="url(#ios_reminders-rimT)"/><rect y="93" width="100" height="7" fill="url(#ios_reminders-rimB)"/><circle cx="21" cy="25" r="11.6" fill="url(#ios_reminders-halo-b)"/><circle cx="21" cy="50" r="11.6" fill="url(#ios_reminders-halo-r)"/><circle cx="21" cy="75" r="11.6" fill="url(#ios_reminders-halo-o)"/><rect x="35.8" y="23.775" width="50.8" height="2.45" rx="1.225" fill="url(#ios_reminders-line)"/><rect x="36.3" y="23.955" width="49.8" height="0.5" rx="0.25" fill="#FFFFFF" opacity="0.28"/><rect x="35.8" y="48.775" width="50.8" height="2.45" rx="1.225" fill="url(#ios_reminders-line)"/><rect x="36.3" y="48.955" width="49.8" height="0.5" rx="0.25" fill="#FFFFFF" opacity="0.28"/><rect x="35.8" y="73.775" width="50.8" height="2.45" rx="1.225" fill="url(#ios_reminders-line)"/><rect x="36.3" y="73.955" width="49.8" height="0.5" rx="0.25" fill="#FFFFFF" opacity="0.28"/><circle cx="21" cy="26.45" r="5.625" fill="#000000" opacity="0.115" filter="url(#ios_reminders-sh)"/><circle cx="21" cy="25" r="6.25" fill="url(#ios_reminders-core-b)"/><g clip-path="url(#ios_reminders-clip-b)"><ellipse cx="19.9" cy="21.9" rx="3.6" ry="2.0" fill="#FFFFFF" opacity="0.28" filter="url(#ios_reminders-spec)" transform="rotate(-20 19.9 21.9)"/><circle cx="20.6" cy="24.1" r="5.9" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.15"/><circle cx="20.5" cy="23.5" r="5.95" fill="none" stroke="#FFFFFF" stroke-width="0.65" opacity="0.11"/></g><circle cx="21" cy="51.45" r="5.625" fill="#000000" opacity="0.115" filter="url(#ios_reminders-sh)"/><circle cx="21" cy="50" r="6.25" fill="url(#ios_reminders-core-r)"/><g clip-path="url(#ios_reminders-clip-r)"><ellipse cx="19.9" cy="46.9" rx="3.6" ry="2.0" fill="#FFFFFF" opacity="0.28" filter="url(#ios_reminders-spec)" transform="rotate(-20 19.9 46.9)"/><circle cx="20.6" cy="49.1" r="5.9" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.15"/><circle cx="20.5" cy="48.5" r="5.95" fill="none" stroke="#FFFFFF" stroke-width="0.65" opacity="0.11"/></g><circle cx="21" cy="76.45" r="5.625" fill="#000000" opacity="0.115" filter="url(#ios_reminders-sh)"/><circle cx="21" cy="75" r="6.25" fill="url(#ios_reminders-core-o)"/><g clip-path="url(#ios_reminders-clip-o)"><ellipse cx="19.9" cy="71.9" rx="3.6" ry="2.0" fill="#FFFFFF" opacity="0.28" filter="url(#ios_reminders-spec)" transform="rotate(-20 19.9 71.9)"/><circle cx="20.6" cy="74.1" r="5.9" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.15"/><circle cx="20.5" cy="73.5" r="5.95" fill="none" stroke="#FFFFFF" stroke-width="0.65" opacity="0.11"/></g></svg>`,
    svg: null,
  },
  calendar: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_calendar-bg" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#F5F5F5"/><stop offset="1" stop-color="#E7E7E7"/>
</linearGradient>
<linearGradient id="ios_calendar-toprim" x1="0" y1="0" x2="0" y2="6" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_calendar-botrim" x1="0" y1="100" x2="0" y2="91" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#000000" stop-opacity="0.07"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_calendar-red" x1="0" y1="14" x2="0" y2="30" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FF5B51"/><stop offset="1" stop-color="#FA3D31"/>
</linearGradient>
<linearGradient id="ios_calendar-stem" x1="51.9" y1="0" x2="57.3" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#5C5C5C"/>
<stop offset="0.15" stop-color="#515151"/>
<stop offset="0.26" stop-color="#4A4A4A"/>
<stop offset="0.34" stop-color="#333333"/>
<stop offset="0.41" stop-color="#181818"/>
<stop offset="0.49" stop-color="#080808"/>
<stop offset="0.60" stop-color="#191919"/>
<stop offset="0.71" stop-color="#2C2C2C"/>
<stop offset="0.82" stop-color="#363636"/>
<stop offset="1" stop-color="#414141"/>
</linearGradient>
<linearGradient id="ios_calendar-flag" x1="45.75" y1="43.06" x2="48.41" y2="46.78" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#606060"/>
<stop offset="0.22" stop-color="#525252"/>
<stop offset="0.34" stop-color="#454545"/>
<stop offset="0.43" stop-color="#272727"/>
<stop offset="0.51" stop-color="#131313"/>
<stop offset="0.63" stop-color="#1C1C1C"/>
<stop offset="0.74" stop-color="#2A2A2A"/>
<stop offset="0.86" stop-color="#313131"/>
<stop offset="1" stop-color="#3A3A3A"/>
</linearGradient>
<linearGradient id="ios_calendar-junc" x1="0" y1="38.8" x2="0" y2="53" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#0C0C0C" stop-opacity="0.95"/>
<stop offset="0.45" stop-color="#0C0C0C" stop-opacity="0.55"/>
<stop offset="1" stop-color="#0C0C0C" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_calendar-juncmaskg" x1="51.9" y1="0" x2="55.2" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#BBBBBB"/><stop offset="1" stop-color="#000000"/>
</linearGradient>
<mask id="ios_calendar-juncmask">
<rect x="51" y="38" width="5" height="16" fill="url(#ios_calendar-juncmaskg)"/>
</mask>
<clipPath id="ios_calendar-glyphclip">
<path d="M51.43 39.00 L40.90 46.53 Q40.45 46.85 40.51 47.40 L40.99 51.50 Q41.05 52.05 41.50 51.73 L52.00 44.22 L52.00 81.50 Q52.00 82.40 52.90 82.40 L56.35 82.40 Q57.25 82.40 57.25 81.50 L57.25 39.90 Q57.25 39.00 56.35 39.00 Z"/>
</clipPath>
<filter id="ios_calendar-shadow" x="30" y="34" width="40" height="60" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="1.3"/>
</filter>
</defs>

<rect width="100" height="100" fill="url(#ios_calendar-bg)"/>
<rect width="100" height="6" fill="url(#ios_calendar-toprim)"/>
<rect y="91" width="100" height="9" fill="url(#ios_calendar-botrim)"/>

<!-- Tue -->
<g fill="url(#ios_calendar-red)" fill-rule="evenodd">
<path d="M34.77 15.04 H45.51 V17.45 H41.60 V29.15 H38.87 V17.45 H34.77 Z"/>
<path d="M45.12 18.80 L45.12 25.30 C45.12 27.75 46.55 29.15 48.95 29.15 L54.88 29.15 L54.88 18.80 L52.33 18.80 L52.33 25.10 C52.33 26.55 51.45 27.45 50.05 27.45 C48.60 27.45 47.67 26.55 47.67 25.10 L47.67 18.80 Z"/>
<path d="M65.78 24.70 A4.98 5.475 0 1 0 65.50 25.95 L62.81 25.95 A2.53 3.07 0 0 1 58.37 24.70 Z M58.60 22.60 A2.53 3.07 0 0 1 63.08 22.60 Z"/>
</g>

<!-- contact shadow -->
<g filter="url(#ios_calendar-shadow)" opacity="0.16">
<path transform="translate(0.5,1.5)" fill="#000000" d="M51.43 39.00 L40.90 46.53 Q40.45 46.85 40.51 47.40 L40.99 51.50 Q41.05 52.05 41.50 51.73 L52.00 44.22 L52.00 81.50 Q52.00 82.40 52.90 82.40 L56.35 82.40 Q57.25 82.40 57.25 81.50 L57.25 39.90 Q57.25 39.00 56.35 39.00 Z"/>
</g>

<!-- numeral 1 -->
<path fill="url(#ios_calendar-stem)" d="M52.00 39.00 L56.35 39.00 Q57.25 39.00 57.25 39.90 L57.25 81.50 Q57.25 82.40 56.35 82.40 L52.90 82.40 Q52.00 82.40 52.00 81.50 Z"/>
<path fill="url(#ios_calendar-flag)" d="M51.43 39.00 L40.90 46.53 Q40.45 46.85 40.51 47.40 L40.99 51.50 Q41.05 52.05 41.50 51.73 L52.60 43.79 L52.60 39.00 Z"/>
<g clip-path="url(#ios_calendar-glyphclip)">
<rect x="51" y="38" width="5" height="16" fill="url(#ios_calendar-junc)" mask="url(#ios_calendar-juncmask)"/>
</g>
</svg>`,
    svg: null,
  },
  appstore: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_appstore-bg" x1="0" y1="10.5" x2="0" y2="90.5" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#24B3FA"/><stop offset="1" stop-color="#1D66EF"/>
</linearGradient>
<linearGradient id="ios_appstore-glass" x1="0" y1="17" x2="0" y2="82" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#C4E3FE"/>
<stop offset="0.138" stop-color="#D7EEFE"/>
<stop offset="0.231" stop-color="#F1FEFF"/>
<stop offset="0.354" stop-color="#C8E5FE"/>
<stop offset="0.477" stop-color="#BEDFFF"/>
<stop offset="0.600" stop-color="#B4D9FF"/>
<stop offset="0.692" stop-color="#B2D8FF"/>
<stop offset="0.815" stop-color="#A0CDFF"/>
<stop offset="0.923" stop-color="#93C5FC"/>
<stop offset="1" stop-color="#8CC0FB"/>
</linearGradient>
<linearGradient id="ios_appstore-glassB" x1="0" y1="17" x2="0" y2="82" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#C4E3FE"/>
<stop offset="0.138" stop-color="#D7EEFE"/>
<stop offset="0.231" stop-color="#F1FEFF"/>
<stop offset="0.354" stop-color="#C8E5FE"/>
<stop offset="0.477" stop-color="#BEDFFF"/>
<stop offset="0.600" stop-color="#B4D9FF"/>
<stop offset="0.692" stop-color="#AED5FF"/>
<stop offset="0.815" stop-color="#96C6FC"/>
<stop offset="0.923" stop-color="#88BDFA"/>
<stop offset="1" stop-color="#84BAFA"/>
</linearGradient>
<filter id="ios_appstore-sh" x="-30%" y="-30%" width="160%" height="160%">
<feGaussianBlur stdDeviation="2.15"/>
</filter>
<filter id="ios_appstore-sp" x="-40%" y="-40%" width="180%" height="180%">
<feGaussianBlur stdDeviation="0.85"/>
</filter>
<clipPath id="ios_appstore-clipbar">
<path d="M48 57.35 H80.8 A4.45 4.45 0 0 1 80.8 66.25 H48 Z"/>
</clipPath>
<clipPath id="ios_appstore-cliplegA">
<path d="M48 57.35 H80.8 A4.45 4.45 0 0 1 80.8 66.25 H82 V71.4 H56 V66.25 H48 Z"/>
</clipPath>
</defs>

<rect width="100" height="100" fill="url(#ios_appstore-bg)"/>

<!-- leg A : top-left down to bottom-right -->
<g filter="url(#ios_appstore-sh)" opacity="0.25">
<line x1="42.2" y1="24.3" x2="73.1" y2="78.5" stroke="#0A2C66" stroke-width="8.8" stroke-linecap="round"/>
</g>
<line x1="44.5" y1="22.4" x2="75.4" y2="76.6" stroke="url(#ios_appstore-glass)" stroke-width="8.8" stroke-linecap="round"/>
<g filter="url(#ios_appstore-sp)">
<line x1="45.3" y1="28.2" x2="70.6" y2="72.9" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity="0.38"/>
</g>

<!-- leg B : top-right down to bottom-left, over leg A -->
<g filter="url(#ios_appstore-sh)" opacity="0.28">
<line x1="58.1" y1="24.3" x2="27.1" y2="78.5" stroke="#0A2C66" stroke-width="8.8" stroke-linecap="round"/>
</g>
<line x1="55.8" y1="22.4" x2="24.8" y2="76.6" stroke="url(#ios_appstore-glassB)" stroke-width="8.8" stroke-linecap="round"/>
<g filter="url(#ios_appstore-sp)">
<line x1="51.0" y1="26.1" x2="25.8" y2="70.7" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.55"/>
</g>

<!-- crossbar, over leg B -->
<g filter="url(#ios_appstore-sh)" opacity="0.38">
<line x1="19.3" y1="64.4" x2="81.0" y2="64.4" stroke="#0A2C66" stroke-width="8.9" stroke-linecap="round"/>
</g>
<line x1="19.1" y1="61.8" x2="80.8" y2="61.8" stroke="url(#ios_appstore-glass)" stroke-width="8.9" stroke-linecap="round"/>
<g filter="url(#ios_appstore-sp)">
<line x1="24.6" y1="59.4" x2="75.3" y2="59.4" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" opacity="0.50"/>
</g>

<!-- weave : leg A rides over the crossbar -->
<g clip-path="url(#ios_appstore-clipbar)">
<g filter="url(#ios_appstore-sh)" opacity="0.27">
<line x1="42.2" y1="24.3" x2="73.1" y2="78.5" stroke="#0A2C66" stroke-width="8.8" stroke-linecap="round"/>
</g>
</g>
<g clip-path="url(#ios_appstore-cliplegA)">
<line x1="44.5" y1="22.4" x2="75.4" y2="76.6" stroke="url(#ios_appstore-glass)" stroke-width="8.8" stroke-linecap="round"/>
<g filter="url(#ios_appstore-sp)">
<line x1="45.3" y1="28.2" x2="70.6" y2="72.9" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity="0.38"/>
</g>
</g>
</svg>`,
    svg: null,
  },
  music: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<linearGradient id="ios_music-bg" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#EE5D77"/><stop offset=".12" stop-color="#EC5973"/><stop offset=".2" stop-color="#EB536C"/><stop offset=".3" stop-color="#EC4C64"/><stop offset=".4" stop-color="#EB465E"/><stop offset=".5" stop-color="#E94055"/><stop offset=".6" stop-color="#EB3B4F"/><stop offset=".7" stop-color="#EA3846"/><stop offset=".8" stop-color="#EA3440"/><stop offset=".9" stop-color="#E9343B"/><stop offset="1" stop-color="#EB3339"/>
</linearGradient>
<linearGradient id="ios_music-rim" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".25" stop-color="#fff" stop-opacity=".17"/><stop offset=".5" stop-color="#fff" stop-opacity=".07"/><stop offset=".75" stop-color="#fff" stop-opacity=".025"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/>
</linearGradient>
<linearGradient id="ios_music-gl" x1="0" y1="13" x2="0" y2="84" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FCEAF0"/><stop offset=".13" stop-color="#FCE7EC"/><stop offset=".24" stop-color="#FAE4EA"/><stop offset=".45" stop-color="#F9DAE3"/><stop offset=".66" stop-color="#F7C9D4"/><stop offset=".86" stop-color="#F1AAB8"/><stop offset="1" stop-color="#ED9BAB"/>
</linearGradient>
<filter id="ios_music-sh" x="-20" y="-20" width="140" height="140" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="2.1"/>
</filter>
<filter id="ios_music-spec" x="-20" y="-20" width="140" height="140" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="3"/>
</filter>
<g id="ios_music-g"><path d="M36.4,74.6L36.4,24.1Q36.4,22.3 38.2,21.95L71.5,14.85Q74.1,14.3 74.1,16.6L74.1,69.6L70.3,69.6L70.3,32.4Q70.3,30.85 68.8,31.15L42.6,36.75Q40.1,37.3 40.1,39.7L40.1,74.6Z"/><ellipse cx="30.5" cy="74.2" rx="10" ry="8.7" transform="rotate(-28 30.5 74.2)"/><ellipse cx="64.4" cy="68.6" rx="10" ry="8.7" transform="rotate(-28 64.4 68.6)"/></g>
<clipPath id="ios_music-clip"><path d="M36.4,74.6L36.4,24.1Q36.4,22.3 38.2,21.95L71.5,14.85Q74.1,14.3 74.1,16.6L74.1,69.6L70.3,69.6L70.3,32.4Q70.3,30.85 68.8,31.15L42.6,36.75Q40.1,37.3 40.1,39.7L40.1,74.6Z"/><ellipse cx="30.5" cy="74.2" rx="10" ry="8.7" transform="rotate(-28 30.5 74.2)"/><ellipse cx="64.4" cy="68.6" rx="10" ry="8.7" transform="rotate(-28 64.4 68.6)"/></clipPath>
</defs>
<rect width="100" height="100" fill="url(#ios_music-bg)"/>
<use href="#ios_music-g" fill="#4A0010" opacity=".14" filter="url(#ios_music-sh)" transform="translate(1.3,2.1)"/>
<use href="#ios_music-g" fill="url(#ios_music-gl)"/>
<g clip-path="url(#ios_music-clip)">
<ellipse cx="40" cy="24" rx="8.5" ry="6.4" fill="#fff" opacity=".45" filter="url(#ios_music-spec)" transform="rotate(-12 40 24)"/>
<ellipse cx="37.8" cy="42" rx="3.2" ry="13" fill="#fff" opacity=".3" filter="url(#ios_music-spec)"/>
<ellipse cx="26.8" cy="69.8" rx="5.4" ry="3.6" fill="#fff" opacity=".24" filter="url(#ios_music-spec)" transform="rotate(-28 26.8 69.8)"/>
<ellipse cx="60.7" cy="64.3" rx="5.4" ry="3.6" fill="#fff" opacity=".22" filter="url(#ios_music-spec)" transform="rotate(-28 60.7 64.3)"/>
<ellipse cx="72.2" cy="36" rx="2.6" ry="9" fill="#fff" opacity=".18" filter="url(#ios_music-spec)"/>
</g>
<path d="M100.000,50.000L99.953,64.959L99.810,70.309L99.573,74.261L99.239,77.494L98.808,80.260L98.279,82.688L97.649,84.850L96.917,86.793L96.079,88.550L95.132,90.141L94.072,91.585L92.891,92.891L91.585,94.072L90.141,95.132L88.550,96.079L86.793,96.917L84.850,97.649L82.688,98.279L80.260,98.808L77.494,99.239L74.261,99.573L70.309,99.810L64.959,99.953L50.000,100.000L35.041,99.953L29.691,99.810L25.739,99.573L22.506,99.239L19.740,98.808L17.312,98.279L15.150,97.649L13.207,96.917L11.450,96.079L9.859,95.132L8.415,94.072L7.109,92.891L5.928,91.585L4.868,90.141L3.921,88.550L3.083,86.793L2.351,84.850L1.721,82.688L1.192,80.260L0.761,77.494L0.427,74.261L0.190,70.309L0.047,64.959L0.000,50.000L0.047,35.041L0.190,29.691L0.427,25.739L0.761,22.506L1.192,19.740L1.721,17.312L2.351,15.150L3.083,13.207L3.921,11.450L4.868,9.859L5.928,8.415L7.109,7.109L8.415,5.928L9.859,4.868L11.450,3.921L13.207,3.083L15.150,2.351L17.312,1.721L19.740,1.192L22.506,0.761L25.739,0.427L29.691,0.190L35.041,0.047L50.000,0.000L64.959,0.047L70.309,0.190L74.261,0.427L77.494,0.761L80.260,1.192L82.688,1.721L84.850,2.351L86.793,3.083L88.550,3.921L90.141,4.868L91.585,5.928L92.891,7.109L94.072,8.415L95.132,9.859L96.079,11.450L96.917,13.207L97.649,15.150L98.279,17.312L98.808,19.740L99.239,22.506L99.573,25.739L99.810,29.691L99.953,35.041Z" fill="none" stroke="url(#ios_music-rim)" stroke-width="3"/>
</svg>`,
    svg: null,
  },
  wallet: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_wallet-bg" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#343434"/><stop offset="0.12" stop-color="#303030"/><stop offset="0.20" stop-color="#2E2E2E"/><stop offset="0.28" stop-color="#2A2A2A"/><stop offset="0.36" stop-color="#282828"/><stop offset="0.44" stop-color="#252525"/><stop offset="0.52" stop-color="#222222"/><stop offset="0.60" stop-color="#1F1F1F"/><stop offset="0.68" stop-color="#1C1C1C"/><stop offset="0.76" stop-color="#191919"/><stop offset="0.86" stop-color="#161616"/><stop offset="1" stop-color="#121212"/>
</linearGradient>
<linearGradient id="ios_wallet-toprim" x1="0" y1="0" x2="0" y2="4" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.07"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_wallet-botrim" x1="0" y1="93" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.14"/>
</linearGradient>

<linearGradient id="ios_wallet-panel" x1="0" y1="22.3" x2="0" y2="77.4" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#D2CFC8"/><stop offset="0.0163" stop-color="#F0EDE2"/><stop offset="0.026" stop-color="#E4E1D6"/><stop offset="0.052" stop-color="#DCDCD1"/><stop offset="0.30" stop-color="#D9D7CD"/><stop offset="1" stop-color="#CECCC3"/>
</linearGradient>
<linearGradient id="ios_wallet-panelside" x1="12.9" y1="0" x2="86.9" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.11"/><stop offset="0.30" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.05"/>
</linearGradient>
<linearGradient id="ios_wallet-panelrim" x1="22" y1="20" x2="78" y2="80" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.60"/><stop offset="0.40" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.30"/>
</linearGradient>

<linearGradient id="ios_wallet-blue" x1="0" y1="26.5" x2="0" y2="42" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#8AD9F9"/><stop offset="0.045" stop-color="#55CBF8"/><stop offset="0.084" stop-color="#3DBEF7"/><stop offset="0.123" stop-color="#1CA7F5"/><stop offset="0.162" stop-color="#12A1F3"/><stop offset="0.45" stop-color="#119FF2"/><stop offset="1" stop-color="#0B95EB"/>
</linearGradient>
<linearGradient id="ios_wallet-yellow" x1="0" y1="33.9" x2="0" y2="49" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#D3C77C"/><stop offset="0.033" stop-color="#F4E453"/><stop offset="0.060" stop-color="#FEE93E"/><stop offset="0.083" stop-color="#FEE137"/><stop offset="0.109" stop-color="#FECC1E"/><stop offset="0.146" stop-color="#FDC50B"/><stop offset="0.30" stop-color="#FFC307"/><stop offset="1" stop-color="#F7B40C"/>
</linearGradient>
<linearGradient id="ios_wallet-red" x1="0" y1="41.45" x2="0" y2="64" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FFC0AC"/><stop offset="0.031" stop-color="#FD957B"/><stop offset="0.050" stop-color="#FF8B70"/><stop offset="0.076" stop-color="#FD6E57"/><stop offset="0.105" stop-color="#FD654E"/><stop offset="0.33" stop-color="#F8614C"/><stop offset="0.50" stop-color="#F15F4A"/><stop offset="0.68" stop-color="#E85E4B"/><stop offset="0.84" stop-color="#DE5741"/><stop offset="1" stop-color="#D25239"/>
</linearGradient>
<linearGradient id="ios_wallet-cardlr" x1="17.5" y1="0" x2="82.5" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/><stop offset="0.028" stop-color="#ffffff" stop-opacity="0.09"/><stop offset="0.30" stop-color="#ffffff" stop-opacity="0.02"/><stop offset="0.75" stop-color="#000000" stop-opacity="0.025"/><stop offset="0.972" stop-color="#000000" stop-opacity="0.05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.22"/>
</linearGradient>

<linearGradient id="ios_wallet-pocket" x1="0" y1="50.2" x2="0" y2="77.5" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#F7EBDD"/><stop offset="0.045" stop-color="#E8D6C7"/><stop offset="0.090" stop-color="#E1CFC2"/><stop offset="0.42" stop-color="#DAC3B6"/><stop offset="0.65" stop-color="#D7B7A9"/><stop offset="0.80" stop-color="#D3B1A4"/><stop offset="0.90" stop-color="#C0B5AC"/><stop offset="0.965" stop-color="#B3ACA4"/><stop offset="1" stop-color="#C7C1BA"/>
</linearGradient>
<linearGradient id="ios_wallet-pocketspec" x1="14" y1="52" x2="58" y2="76" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.20"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_wallet-pocketlr" x1="12.9" y1="0" x2="86.9" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#B9C4CC" stop-opacity="0.40"/><stop offset="0.07" stop-color="#B9C4CC" stop-opacity="0"/><stop offset="0.93" stop-color="#B9C4CC" stop-opacity="0"/><stop offset="1" stop-color="#B9C4CC" stop-opacity="0.55"/>
</linearGradient>

<filter id="ios_wallet-drop" x="-30" y="-30" width="160" height="160" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="2.1"/>
</filter>
<filter id="ios_wallet-soft" x="-30" y="-30" width="160" height="160" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="1.1"/>
</filter>
<filter id="ios_wallet-lipglow" x="-30" y="-30" width="160" height="160" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="0.38"/>
</filter>
<filter id="ios_wallet-glow" x="-30" y="-30" width="160" height="160" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="0.45"/>
</filter>

<clipPath id="ios_wallet-panelclip"><rect x="12.9" y="22.3" width="74" height="55.1" rx="7.4"/></clipPath>
<clipPath id="ios_wallet-pocketclip"><path d="M12.9,50.2 L33.0,50.2 C40.0,50.5 43.0,60.2 49.9,60.2 C56.8,60.2 59.8,50.5 66.8,50.2 L86.9,50.2 L86.9,70.0 A7.4,7.4 0 0 1 79.5,77.4 L20.3,77.4 A7.4,7.4 0 0 1 12.9,70.0 Z"/></clipPath>
</defs>

<rect width="100" height="100" fill="url(#ios_wallet-bg)"/>
<rect width="100" height="100" fill="url(#ios_wallet-toprim)"/>
<rect width="100" height="100" fill="url(#ios_wallet-botrim)"/>

<!-- contact shadow under the wallet -->
<g filter="url(#ios_wallet-drop)">
<rect x="13.6" y="24.4" width="72.6" height="55.8" rx="7.4" fill="#000000" fill-opacity="0.62"/>
</g>

<!-- back panel -->
<rect x="12.9" y="22.3" width="74" height="55.1" rx="7.4" fill="url(#ios_wallet-panel)"/>

<g clip-path="url(#ios_wallet-panelclip)">
  <rect x="12.9" y="22.3" width="74" height="55.1" fill="url(#ios_wallet-panelside)"/>

  <!-- blue card + its shadow on the panel -->
  <g filter="url(#ios_wallet-soft)"><rect x="17.5" y="27.5" width="65" height="20" rx="3.4" fill="#000000" fill-opacity="0.15"/></g>
  <rect x="17.5" y="26.5" width="65" height="30" rx="3.4" fill="url(#ios_wallet-blue)"/>
  <rect x="17.5" y="26.5" width="65" height="8" fill="url(#ios_wallet-cardlr)"/>

  <!-- yellow card -->
  <g filter="url(#ios_wallet-soft)"><rect x="17.5" y="34.6" width="65" height="14" rx="3.4" fill="#000000" fill-opacity="0.17"/></g>
  <rect x="17.5" y="33.9" width="65" height="30" rx="3.4" fill="url(#ios_wallet-yellow)"/>
  <rect x="17.5" y="33.9" width="65" height="8" fill="url(#ios_wallet-cardlr)"/>

  <!-- red card -->
  <g filter="url(#ios_wallet-soft)"><rect x="17.5" y="42.1" width="65" height="14" rx="3.4" fill="#000000" fill-opacity="0.17"/></g>
  <rect x="17.5" y="41.45" width="65" height="38" rx="3.4" fill="url(#ios_wallet-red)"/>
  <rect x="17.5" y="41.45" width="65" height="20" fill="url(#ios_wallet-cardlr)"/>

  <!-- pocket shadow cast onto the cards -->
  <g filter="url(#ios_wallet-soft)">
    <path d="M12.9,51.7 L33.0,51.7 C40.0,52.0 43.0,61.7 49.9,61.7 C56.8,61.7 59.8,52.0 66.8,51.7 L86.9,51.7 L86.9,78 L12.9,78 Z" fill="#000000" fill-opacity="0.28"/>
  </g>

  <!-- light caught on the red where the lip curves -->
  <g filter="url(#ios_wallet-lipglow)">
    <ellipse cx="49.9" cy="59.95" rx="8.0" ry="0.25" fill="#FFE6D8" fill-opacity="0.62"/>
  </g>
  <!-- pocket -->
  <path d="M12.9,50.2 L33.0,50.2 C40.0,50.5 43.0,60.2 49.9,60.2 C56.8,60.2 59.8,50.5 66.8,50.2 L86.9,50.2 L86.9,70.0 A7.4,7.4 0 0 1 79.5,77.4 L20.3,77.4 A7.4,7.4 0 0 1 12.9,70.0 Z" fill="url(#ios_wallet-pocket)"/>
  <g clip-path="url(#ios_wallet-pocketclip)">
    <rect x="12.9" y="50.2" width="74" height="27.2" fill="url(#ios_wallet-pocketspec)"/>
    <rect x="12.9" y="50.2" width="74" height="27.2" fill="url(#ios_wallet-pocketlr)"/>
  </g>
  <!-- lit lip along the pocket's top edge, bleeding both ways -->
  <g filter="url(#ios_wallet-glow)">
    <path d="M12.9,50.6 L33.0,50.6 C40.0,50.9 43.0,60.6 49.9,60.6 C56.8,60.6 59.8,50.9 66.8,50.6 L86.9,50.6" fill="none" stroke="#FFE2CC" stroke-opacity="0.62" stroke-width="1.2" stroke-linecap="round"/>
  </g>
  <g clip-path="url(#ios_wallet-pocketclip)">
    <path d="M12.9,50.2 L33.0,50.2 C40.0,50.5 43.0,60.2 49.9,60.2 C56.8,60.2 59.8,50.5 66.8,50.2 L86.9,50.2" fill="none" stroke="#FFF2E2" stroke-opacity="0.48" stroke-width="1.8"/>
  </g>
</g>

<!-- panel outer rim -->
<rect x="13.25" y="22.65" width="73.3" height="54.5" rx="7.05" fill="none" stroke="url(#ios_wallet-panelrim)" stroke-width="0.7"/>
</svg>`,
    svg: null,
  },
  files: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_files-bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FCFCFC"/><stop offset="0.55" stop-color="#F1F1F0"/><stop offset="1" stop-color="#DEDEDC"/>
</linearGradient>
<radialGradient id="ios_files-vig" cx="0.42" cy="0.3" r="0.85">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.75"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="ios_files-toprim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_files-botrim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.10"/>
</linearGradient>
<linearGradient id="ios_files-tab" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#4EA6F7"/><stop offset="1" stop-color="#3892EE"/>
</linearGradient>
<linearGradient id="ios_files-sheet" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9F2FB"/>
</linearGradient>
<linearGradient id="ios_files-front" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#4499F2"/><stop offset="0.45" stop-color="#5EACF6"/><stop offset="1" stop-color="#8BC1F7"/>
</linearGradient>
<linearGradient id="ios_files-rim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#2E90EE"/><stop offset="0.5" stop-color="#3E9BF1"/><stop offset="1" stop-color="#6DB2F0"/>
</linearGradient>
<linearGradient id="ios_files-spec" x1="0" y1="0" x2="0.55" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<filter id="ios_files-shadow" x="-20" y="-20" width="140" height="140">
<feGaussianBlur stdDeviation="2.1"/>
</filter>
<filter id="ios_files-soft" x="-20" y="-20" width="140" height="140">
<feGaussianBlur stdDeviation="1.6"/>
</filter>
<filter id="ios_files-soft2" x="-20" y="-20" width="140" height="140">
<feGaussianBlur stdDeviation="0.7"/>
</filter>
<clipPath id="ios_files-clipfront">
<rect x="13" y="32" width="73" height="46" rx="6"/>
</clipPath>
<clipPath id="ios_files-cliptab">
<path d="M16.5,19 H33.2 q2.6,0 4.2,2 L39.1,23 q1.6,2 4.2,2 H82.5 q3.5,0 3.5,3.5 V40 H13 V22.5 Q13,19 16.5,19 Z"/>
</clipPath>
</defs>

<rect width="100" height="100" fill="url(#ios_files-bg)"/>
<rect width="100" height="100" fill="url(#ios_files-vig)"/>
<rect width="100" height="4.5" fill="url(#ios_files-toprim)"/>
<rect y="93" width="100" height="7" fill="url(#ios_files-botrim)"/>

<g filter="url(#ios_files-shadow)" opacity="0.30">
  <path d="M16.5,21.4 H33.2 q2.6,0 4.2,2 L39.1,25.4 q1.6,2 4.2,2 H82.5 q3.5,0 3.5,3.5 V42.4 H13 V24.9 Q13,21.4 16.5,21.4 Z" fill="#2A4C74"/>
  <rect x="13" y="34.4" width="73" height="46" rx="6" fill="#2A4C74"/>
</g>

<g filter="url(#ios_files-shadow)" opacity="0.55">
  <rect x="12" y="18" width="75" height="61" rx="7" fill="#FFFFFF"/>
</g>
<path d="M16.5,19 H33.2 q2.6,0 4.2,2 L39.1,23 q1.6,2 4.2,2 H82.5 q3.5,0 3.5,3.5 V40 H13 V22.5 Q13,19 16.5,19 Z" fill="url(#ios_files-tab)" stroke="#2F91EE" stroke-width="0.9" stroke-linejoin="round"/>
<g clip-path="url(#ios_files-cliptab)">
  <path d="M13,19 H44 L44,22 H13 Z" fill="#FFFFFF" opacity="0.42" filter="url(#ios_files-soft2)"/>
</g>

<rect x="15.6" y="27.6" width="68.8" height="10" rx="2.6" fill="url(#ios_files-sheet)" stroke="#BFD8F0" stroke-width="0.45"/>

<rect x="13" y="32" width="73" height="46" rx="6" fill="url(#ios_files-front)" stroke="url(#ios_files-rim)" stroke-width="1.5"/>

<g clip-path="url(#ios_files-clipfront)">
  <path d="M13,32 H86 L86,35.4 H13 Z" fill="#FFFFFF" opacity="0.5" filter="url(#ios_files-soft2)"/>
  <path d="M13,32 L47,32 Q26,48 19,78 L13,78 Z" fill="url(#ios_files-spec)" filter="url(#ios_files-soft)"/>
  <path d="M86,78 L86,44 Q68,66 40,78 Z" fill="#2C6FB8" opacity="0.10" filter="url(#ios_files-soft)"/>
  <path d="M13,74.2 H86 V78 H13 Z" fill="#FFFFFF" opacity="0.40" filter="url(#ios_files-soft2)"/>
  <path d="M82.4,32 H86 V78 H82.4 Z" fill="#FFFFFF" opacity="0.18" filter="url(#ios_files-soft2)"/>
</g>
</svg>`,
    svg: null,
  },
  podcasts: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ios_podcasts-bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#A755D1"/><stop offset="0.5" stop-color="#8F43C0"/><stop offset="1" stop-color="#7731AE"/>
</linearGradient>
<linearGradient id="ios_podcasts-toprim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.36"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_podcasts-botrim" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="0.62" stop-color="#000000" stop-opacity="0.05"/><stop offset="0.88" stop-color="#000000" stop-opacity="0.02"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.12"/>
</linearGradient>
<linearGradient id="ios_podcasts-d1" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#EEEDF6" stop-opacity="0.29"/><stop offset="1" stop-color="#EEEDF6" stop-opacity="0.21"/>
</linearGradient>
<linearGradient id="ios_podcasts-d2" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#E9EAF0" stop-opacity="0.43"/><stop offset="1" stop-color="#E9EAF0" stop-opacity="0.42"/>
</linearGradient>
<linearGradient id="ios_podcasts-glow1" x1="0.2" y1="0" x2="0.8" y2="1">
<stop offset="0" stop-color="#F0E1FA" stop-opacity="0.26"/><stop offset="0.5" stop-color="#F0E1FA" stop-opacity="0.07"/><stop offset="1" stop-color="#F0E1FA" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_podcasts-glow2" x1="0.2" y1="0" x2="0.8" y2="1">
<stop offset="0" stop-color="#F0E1FA" stop-opacity="0.22"/><stop offset="0.5" stop-color="#F0E1FA" stop-opacity="0.06"/><stop offset="1" stop-color="#F0E1FA" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_podcasts-rim1" x1="0.18" y1="0.05" x2="0.82" y2="0.95"><stop offset="0" stop-color="#F8CCFF" stop-opacity="0.86"/><stop offset="0.135" stop-color="#F8CCFF" stop-opacity="0.72"/><stop offset="0.262" stop-color="#F8CCFF" stop-opacity="0.44"/><stop offset="0.578" stop-color="#F8CCFF" stop-opacity="0.22"/><stop offset="0.773" stop-color="#F8CCFF" stop-opacity="0.10"/><stop offset="0.95" stop-color="#F8CCFF" stop-opacity="0"/></linearGradient>
<linearGradient id="ios_podcasts-rim2" x1="0.18" y1="0.05" x2="0.82" y2="0.95"><stop offset="0" stop-color="#FCDEFF" stop-opacity="0.70"/><stop offset="0.14" stop-color="#FCDEFF" stop-opacity="0.60"/><stop offset="0.30" stop-color="#FCDEFF" stop-opacity="0.42"/><stop offset="0.60" stop-color="#FCDEFF" stop-opacity="0.24"/><stop offset="0.79" stop-color="#FCDEFF" stop-opacity="0.13"/><stop offset="0.95" stop-color="#FCDEFF" stop-opacity="0"/></linearGradient>
<linearGradient id="ios_podcasts-shade" x1="0.5" y1="0" x2="0.5" y2="1">
<stop offset="0.5" stop-color="#360A56" stop-opacity="0"/><stop offset="1" stop-color="#360A56" stop-opacity="0.26"/>
</linearGradient>
<linearGradient id="ios_podcasts-head" x1="0.25" y1="0" x2="0.7" y2="1">
<stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#FBF8FD"/><stop offset="0.86" stop-color="#F1E7F8"/><stop offset="1" stop-color="#E4D2F0"/>
</linearGradient>
<linearGradient id="ios_podcasts-body" x1="0.5" y1="0" x2="0.5" y2="1">
<stop offset="0" stop-color="#ffffff"/><stop offset="0.05" stop-color="#FCFAFE"/><stop offset="0.10" stop-color="#F6F0FA"/><stop offset="0.31" stop-color="#ECE5F4"/><stop offset="0.50" stop-color="#DCCBE7"/><stop offset="0.65" stop-color="#CEB8E0"/><stop offset="0.88" stop-color="#B896D1"/><stop offset="0.97" stop-color="#B491CE"/><stop offset="1" stop-color="#BE9CD6"/>
</linearGradient>
<filter id="ios_podcasts-sh" x="-45%" y="-35%" width="190%" height="185%"><feGaussianBlur stdDeviation="2.0"/></filter>
<filter id="ios_podcasts-shw" x="-60%" y="-50%" width="220%" height="210%"><feGaussianBlur stdDeviation="4.0"/></filter>
<filter id="ios_podcasts-glowb" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="2.4"/></filter>
<filter id="ios_podcasts-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.75"/></filter>
<filter id="ios_podcasts-soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.4"/></filter>
<filter id="ios_podcasts-spec" x="-60%" y="-45%" width="220%" height="190%"><feGaussianBlur stdDeviation="0.6"/></filter>
<filter id="ios_podcasts-spech" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.95"/></filter>
<clipPath id="ios_podcasts-c1"><circle cx="50.4" cy="46.9" r="36.8"/></clipPath>
<clipPath id="ios_podcasts-c2"><circle cx="50.4" cy="45.85" r="22.5"/></clipPath>
<clipPath id="ios_podcasts-clipbody">
<path d="M59.082 66.337 A9.18 9.18 0 1 0 40.918 66.337 L43.599 84.543 A6.47 6.47 0 0 0 56.401 84.543 Z"/>
</clipPath>
<clipPath id="ios_podcasts-cliphead"><circle cx="50" cy="44.9" r="8.5"/></clipPath>
</defs>

<rect width="100" height="100" fill="url(#ios_podcasts-bg)"/>
<rect width="100" height="3.2" fill="url(#ios_podcasts-toprim)"/>
<rect y="80" width="100" height="20" fill="url(#ios_podcasts-botrim)"/>

<circle cx="50.4" cy="46.9" r="36.8" fill="url(#ios_podcasts-d1)"/>
<g clip-path="url(#ios_podcasts-c1)">
<circle cx="50.4" cy="46.9" r="33.3" fill="none" stroke="url(#ios_podcasts-glow1)" stroke-width="8" filter="url(#ios_podcasts-glowb)"/>
<circle cx="50.4" cy="46.9" r="36.35" fill="none" stroke="url(#ios_podcasts-rim1)" stroke-width="1.55" filter="url(#ios_podcasts-soft)"/>
<circle cx="50.4" cy="46.9" r="36.4" fill="none" stroke="url(#ios_podcasts-shade)" stroke-width="0.9" filter="url(#ios_podcasts-soft2)"/>
</g>
<circle cx="50.4" cy="45.85" r="22.5" fill="url(#ios_podcasts-d2)"/>
<g clip-path="url(#ios_podcasts-c2)">
<circle cx="50.4" cy="45.85" r="19.3" fill="none" stroke="url(#ios_podcasts-glow2)" stroke-width="6.8" filter="url(#ios_podcasts-glowb)"/>
<circle cx="50.4" cy="45.85" r="22.05" fill="none" stroke="url(#ios_podcasts-rim2)" stroke-width="1.55" filter="url(#ios_podcasts-soft)"/>
<circle cx="50.4" cy="45.85" r="22.1" fill="none" stroke="url(#ios_podcasts-shade)" stroke-width="0.9" filter="url(#ios_podcasts-soft2)"/>
</g>

<g filter="url(#ios_podcasts-shw)" opacity="0.13" transform="translate(1.0,1.8)">
<circle cx="50" cy="44.9" r="8.5" fill="#280840"/>
<path d="M59.082 66.337 A9.18 9.18 0 1 0 40.918 66.337 L43.599 84.543 A6.47 6.47 0 0 0 56.401 84.543 Z" fill="#280840"/>
</g>
<g filter="url(#ios_podcasts-sh)" opacity="0.20" transform="translate(1.0,1.6)">
<circle cx="50" cy="44.9" r="8.5" fill="#280840"/>
<path d="M59.082 66.337 A9.18 9.18 0 1 0 40.918 66.337 L43.599 84.543 A6.47 6.47 0 0 0 56.401 84.543 Z" fill="#280840"/>
</g>

<circle cx="50" cy="44.9" r="8.5" fill="url(#ios_podcasts-head)"/>
<path d="M59.082 66.337 A9.18 9.18 0 1 0 40.918 66.337 L43.599 84.543 A6.47 6.47 0 0 0 56.401 84.543 Z" fill="url(#ios_podcasts-body)"/>

<g clip-path="url(#ios_podcasts-clipbody)">
<path d="M42.3 68.9 L44.25 84.6 Q45.0 86.6 46.3 87.8" fill="none" stroke="#ffffff" stroke-opacity="0.66" stroke-width="1.15" stroke-linecap="round" filter="url(#ios_podcasts-spec)"/>
<path d="M57.75 75.0 L56.5 84.3 Q56.0 86.4 54.6 87.6" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="1.0" stroke-linecap="round" filter="url(#ios_podcasts-spec)"/>
<ellipse cx="50" cy="88.3" rx="3.6" ry="1.2" fill="#ffffff" fill-opacity="0.4" filter="url(#ios_podcasts-spec)"/>
</g>
<g clip-path="url(#ios_podcasts-cliphead)">
<ellipse cx="46.2" cy="40.6" rx="5.6" ry="4.2" fill="#ffffff" fill-opacity="0.55" filter="url(#ios_podcasts-spech)"/>
</g>
</svg>`,
    svg: null,
  },
  journal: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<linearGradient id="ios_journal-bg" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#343858"/><stop offset="0.5" stop-color="#2A2C43"/><stop offset="1" stop-color="#212437"/>
</linearGradient>
<linearGradient id="ios_journal-toprim" x1="0" y1="0" x2="0" y2="3" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.4"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.11"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_journal-botrim" x1="0" y1="100" x2="0" y2="96" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.15"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.03"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>

<linearGradient id="ios_journal-ul" x1="17" y1="0" x2="47.85" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#7960FA"/><stop offset="0.5" stop-color="#8A5FE3"/><stop offset="1" stop-color="#9D5CC9"/>
</linearGradient>
<linearGradient id="ios_journal-ur" x1="52.15" y1="0" x2="83" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#FAD8C3"/><stop offset="0.5" stop-color="#F4B9A9"/><stop offset="1" stop-color="#F1A197"/>
</linearGradient>
<linearGradient id="ios_journal-urpink" x1="0" y1="36" x2="0" y2="54" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#E3789C" stop-opacity="0"/><stop offset="1" stop-color="#E3789C" stop-opacity="0.6"/>
</linearGradient>
<linearGradient id="ios_journal-ll" x1="0" y1="50" x2="0" y2="84" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#3F47F2"/><stop offset="0.5" stop-color="#4761CF"/><stop offset="1" stop-color="#4765A0"/>
</linearGradient>
<linearGradient id="ios_journal-lr" x1="0" y1="48.5" x2="0" y2="84" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#E7437E"/><stop offset="0.5" stop-color="#B84156"/><stop offset="1" stop-color="#883D42"/>
</linearGradient>

<linearGradient id="ios_journal-seamL" x1="43.2" y1="0" x2="47.85" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#1A1030" stop-opacity="0"/><stop offset="1" stop-color="#1A1030" stop-opacity="0.26"/>
</linearGradient>
<linearGradient id="ios_journal-seamR" x1="56.8" y1="0" x2="52.15" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#2B0D1E" stop-opacity="0"/><stop offset="1" stop-color="#2B0D1E" stop-opacity="0.22"/>
</linearGradient>

<linearGradient id="ios_journal-boostUL" x1="17" y1="14" x2="31" y2="38" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.62"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.2"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_journal-boostUR" x1="83" y1="14" x2="69" y2="38" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.62"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.2"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_journal-boostLL" x1="24.5" y1="0" x2="31" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.68"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_journal-boostLR" x1="75.5" y1="0" x2="69" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.68"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_journal-edgeL" x1="45.4" y1="0" x2="47.85" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#1A0E33" stop-opacity="0"/><stop offset="1" stop-color="#1A0E33" stop-opacity="0.55"/>
</linearGradient>
<linearGradient id="ios_journal-edgeR" x1="54.6" y1="0" x2="52.15" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#3A0A20" stop-opacity="0"/><stop offset="1" stop-color="#3A0A20" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="ios_journal-lrpink" x1="52.15" y1="0" x2="66" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#E8688E" stop-opacity="0.22"/><stop offset="1" stop-color="#E8688E" stop-opacity="0"/>
</linearGradient>
<linearGradient id="ios_journal-llblue" x1="47.85" y1="0" x2="36" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#3B44E0" stop-opacity="0.2"/><stop offset="1" stop-color="#3B44E0" stop-opacity="0"/>
</linearGradient>
<radialGradient id="ios_journal-spec" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>

<filter id="ios_journal-drop" x="-20" y="-20" width="140" height="140" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="2.1"/>
</filter>
<filter id="ios_journal-soft" x="-20" y="-20" width="140" height="140" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="1.5"/>
</filter>
<filter id="ios_journal-rimblur" x="-20" y="-20" width="140" height="140" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="0.55"/>
</filter>
<filter id="ios_journal-specblur" x="-20" y="-20" width="140" height="140" filterUnits="userSpaceOnUse">
<feGaussianBlur stdDeviation="2.8"/>
</filter>

<path id="ios_journal-pUL" d="M17 18.6Q17 15.45 20.3 15.45A33.98 33.98 0 0 1 47.85 35.16L47.85 67.19C46.09 58.79 35.94 51.76 20.3 47.46Q17 47.46 17 44.46Z"/>
<path id="ios_journal-pUR" d="M83 18.6Q83 15.45 79.7 15.45A33.98 33.98 0 0 0 52.15 35.16L52.15 67.19C53.91 58.79 64.06 51.76 79.7 47.46Q83 47.46 83 44.46Z"/>
<path id="ios_journal-pLL" d="M28.7 51.37L47.85 51.37L47.85 67.97C46.09 75.39 36.5 83.45 30.4 83.45A4.3 4.3 0 0 1 25 79.15L25 55.1A3.71 3.71 0 0 1 28.7 51.37Z"/>
<path id="ios_journal-pLR" d="M71.3 51.37L52.15 51.37L52.15 67.97C53.91 75.39 63.5 83.45 69.6 83.45A4.3 4.3 0 0 0 75 79.15L75 55.1A3.71 3.71 0 0 0 71.3 51.37Z"/>

<clipPath id="ios_journal-cUL"><use href="#ios_journal-pUL"/></clipPath>
<clipPath id="ios_journal-cUR"><use href="#ios_journal-pUR"/></clipPath>
<clipPath id="ios_journal-cLL"><use href="#ios_journal-pLL"/></clipPath>
<clipPath id="ios_journal-cLR"><use href="#ios_journal-pLR"/></clipPath>
</defs>

<rect width="100" height="100" fill="url(#ios_journal-bg)"/>
<rect width="100" height="3" fill="url(#ios_journal-toprim)"/>
<rect y="96" width="100" height="4" fill="url(#ios_journal-botrim)"/>

<g filter="url(#ios_journal-drop)" opacity="0.38">
<g transform="translate(0.5,2.4)" fill="#000000" fill-opacity="0.55">
<use href="#ios_journal-pUL"/><use href="#ios_journal-pUR"/><use href="#ios_journal-pLL"/><use href="#ios_journal-pLR"/>
</g>
</g>

<g clip-path="url(#ios_journal-cLL)">
<use href="#ios_journal-pLL" fill="url(#ios_journal-ll)"/>
<rect x="34" y="48" width="16" height="40" fill="url(#ios_journal-llblue)"/>
<g filter="url(#ios_journal-rimblur)">
<use href="#ios_journal-pLL" fill="none" stroke="#DCE8FF" stroke-opacity="0.13" stroke-width="2.2"/>
<use href="#ios_journal-pLL" fill="none" stroke="url(#ios_journal-boostLL)" stroke-width="2.1"/>
</g>
<use href="#ios_journal-pLL" fill="none" stroke="#0B0A28" stroke-opacity="0.22" stroke-width="1.2"/>
</g>

<g clip-path="url(#ios_journal-cLR)">
<use href="#ios_journal-pLR" fill="url(#ios_journal-lr)"/>
<rect x="52" y="48" width="16" height="40" fill="url(#ios_journal-lrpink)"/>
<g filter="url(#ios_journal-rimblur)">
<use href="#ios_journal-pLR" fill="none" stroke="#FFE4E9" stroke-opacity="0.12" stroke-width="2.2"/>
<use href="#ios_journal-pLR" fill="none" stroke="url(#ios_journal-boostLR)" stroke-width="2.1"/>
</g>
<use href="#ios_journal-pLR" fill="none" stroke="#25060F" stroke-opacity="0.22" stroke-width="1.2"/>
</g>

<g clip-path="url(#ios_journal-cUL)">
<use href="#ios_journal-pUL" fill="url(#ios_journal-ul)"/>
<g filter="url(#ios_journal-rimblur)">
<use href="#ios_journal-pUL" fill="none" stroke="#E7DFFF" stroke-opacity="0.14" stroke-width="2.2"/>
<use href="#ios_journal-pUL" fill="none" stroke="url(#ios_journal-boostUL)" stroke-width="2.1"/>
<use href="#ios_journal-pUL" fill="none" stroke="url(#ios_journal-edgeL)" stroke-width="2.6"/>
</g>
<use href="#ios_journal-pUL" fill="none" stroke="#140A2E" stroke-opacity="0.24" stroke-width="1.2"/>
</g>

<g clip-path="url(#ios_journal-cUR)">
<use href="#ios_journal-pUR" fill="url(#ios_journal-ur)"/>
<rect x="52" y="30" width="32" height="40" fill="url(#ios_journal-urpink)"/>
<g filter="url(#ios_journal-rimblur)">
<use href="#ios_journal-pUR" fill="none" stroke="#FFF4EE" stroke-opacity="0.14" stroke-width="2.2"/>
<use href="#ios_journal-pUR" fill="none" stroke="url(#ios_journal-boostUR)" stroke-width="2.1"/>
<use href="#ios_journal-pUR" fill="none" stroke="url(#ios_journal-edgeR)" stroke-width="2.6"/>
</g>
<use href="#ios_journal-pUR" fill="none" stroke="#2A0813" stroke-opacity="0.2" stroke-width="1.2"/>
</g>
</svg>`,
    svg: null,
  },
  /* --- Samsung --- */
  /* --- Google --- */
  sam_contacts: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sam_contacts-bg" x1="0.12" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#EE3B49"/><stop offset="0.5" stop-color="#E52836"/><stop offset="1" stop-color="#DA1929"/></linearGradient><radialGradient id="sam_contacts-ul" cx="0.24" cy="0.16" r="0.72"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.2"/><stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.05"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient><radialGradient id="sam_contacts-lr" cx="0.86" cy="0.9" r="0.66"><stop offset="0" stop-color="#5C0007" stop-opacity="0.24"/><stop offset="0.6" stop-color="#5C0007" stop-opacity="0.08"/><stop offset="1" stop-color="#5C0007" stop-opacity="0"/></radialGradient><radialGradient id="sam_contacts-disc" cx="0.42" cy="0.7" r="0.8"><stop offset="0" stop-color="#C20A19"/><stop offset="0.6" stop-color="#B5020F"/><stop offset="1" stop-color="#A4000B"/></radialGradient><linearGradient id="sam_contacts-gl" x1="0.25" y1="0" x2="0.75" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#FEFAFB"/><stop offset="1" stop-color="#F7E9EB"/></linearGradient><filter id="sam_contacts-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter><filter id="sam_contacts-soft2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.1"/></filter><clipPath id="sam_contacts-discClip"><circle cx="50" cy="48.4" r="38"/></clipPath><path id="sam_contacts-glyph" d="M49.3 51.4C42.01 51.4 30.85 59.93 30.85 65.5C30.85 70.4 40.43 75.7 49.3 75.7C58.17 75.7 67.75 70.4 67.75 65.5C67.75 59.93 56.59 51.4 49.3 51.4Z"/></defs><rect width="100" height="100" fill="url(#sam_contacts-bg)"/><rect width="100" height="100" fill="url(#sam_contacts-ul)"/><rect width="100" height="100" fill="url(#sam_contacts-lr)"/><circle cx="50" cy="49.3" r="38.1" fill="#8E0009" opacity="0.16" filter="url(#sam_contacts-soft2)"/><circle cx="50" cy="48.4" r="38" fill="url(#sam_contacts-disc)"/><g clip-path="url(#sam_contacts-discClip)"><ellipse cx="50" cy="4" rx="42" ry="11" fill="#78000A" opacity="0.2" filter="url(#sam_contacts-soft)"/><ellipse cx="50" cy="92" rx="40" ry="12" fill="#FF6B6B" opacity="0.13" filter="url(#sam_contacts-soft)"/></g><g opacity="0.34" filter="url(#sam_contacts-soft2)" fill="#6E0008"><circle cx="49.5" cy="38.2" r="8.6"/><use href="#sam_contacts-glyph" transform="translate(0.2,1.4)"/></g><circle cx="49.3" cy="36.9" r="8.6" fill="url(#sam_contacts-gl)"/><path d="M49.3 51.4C42.01 51.4 30.85 59.93 30.85 65.5C30.85 70.4 40.43 75.7 49.3 75.7C58.17 75.7 67.75 70.4 67.75 65.5C67.75 59.93 56.59 51.4 49.3 51.4Z" fill="url(#sam_contacts-gl)"/></svg>`,
    svg: null,
  },
  pix_gmail: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="pix_gmail-clip"><path d="M18 25.5A7.5 7.5 0 0 1 25.5 18H74.5A7.5 7.5 0 0 1 82 25.5V77A5 5 0 0 1 77 82H23A5 5 0 0 1 18 77Z"/></clipPath></defs><rect width="100" height="100" fill="#FFFFFF"/><g clip-path="url(#pix_gmail-clip)"><rect x="18" y="18" width="14.5" height="64" fill="#4285F4"/><rect x="67.5" y="18" width="14.5" height="64" fill="#34A853"/><path d="M18 18H26.625L32.5 23.875V48.875L18 34.375Z" fill="#C5221F"/><path d="M32.5 23.875L50 41.375L67.5 23.875V48.875L50 66.375L32.5 48.875Z" fill="#EA4335"/><path d="M67.5 23.875L73.375 18H82V34.375L67.5 48.875Z" fill="#FBBC04"/></g></svg>`,
    svg: null,
  },
  pix_messages: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="pix_messages-clipA"><rect x="16.75" y="16.25" width="61.694" height="42.861" rx="21.431"/></clipPath></defs><rect width="100" height="100" fill="#FFFFFF"/><rect x="16.75" y="16.25" width="61.694" height="42.861" rx="21.431" fill="#86A9FF"/><path d="M42.532 25.731L61.884 25.731A21.106 21.106 0 0 1 61.884 67.943L50.455 67.943L50.455 80.607A1.312 1.312 0 0 1 48.208 82.36L27.608 61.761A21.106 21.106 0 0 1 42.532 25.731Z" fill="#578CFF"/><g clip-path="url(#pix_messages-clipA)"><path d="M42.532 25.731L61.884 25.731A21.106 21.106 0 0 1 61.884 67.943L50.455 67.943L50.455 80.607A1.312 1.312 0 0 1 48.208 82.36L27.608 61.761A21.106 21.106 0 0 1 42.532 25.731Z" fill="#0057CC"/></g></svg>`,
    svg: null,
  },
  pix_photos: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision"><rect width="100" height="100" fill="#FFFFFF"/><g id="pix_photos-mark"><path d="M50 17.18A16.37 16.37 0 1 1 50 49.76Z" fill="#EA4335"/><path d="M82.81 50A16.37 16.37 0 1 1 50.23 50Z" fill="#4285F4"/><path d="M50 82.81A16.37 16.37 0 1 1 50 50.23Z" fill="#34A853"/><path d="M17.18 50A16.37 16.37 0 1 1 49.76 50Z" fill="#FBBC04"/></g></svg>`,
    svg: null,
  },
  pix_youtube: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#FFFFFF"/><path d="M83.00,50.00L82.99,56.35L82.97,58.83L82.93,60.71L82.88,62.28L82.81,63.64L82.72,64.87L82.62,65.98L82.50,67.01L82.37,67.97L82.22,68.86L82.06,69.71L81.88,70.50L81.68,71.26L81.47,71.98L81.24,72.66L80.99,73.31L80.73,73.93L80.45,74.52L80.15,75.08L79.83,75.62L79.50,76.14L79.15,76.63L78.78,77.10L78.39,77.55L77.98,77.98L77.55,78.39L77.10,78.78L76.63,79.15L76.14,79.50L75.62,79.83L75.08,80.15L74.52,80.45L73.93,80.73L73.31,80.99L72.66,81.24L71.98,81.47L71.26,81.68L70.50,81.88L69.71,82.06L68.86,82.22L67.97,82.37L67.01,82.50L65.98,82.62L64.87,82.72L63.64,82.81L62.28,82.88L60.71,82.93L58.83,82.97L56.35,82.99L50.00,83.00L43.65,82.99L41.17,82.97L39.29,82.93L37.72,82.88L36.36,82.81L35.13,82.72L34.02,82.62L32.99,82.50L32.03,82.37L31.14,82.22L30.29,82.06L29.50,81.88L28.74,81.68L28.02,81.47L27.34,81.24L26.69,80.99L26.07,80.73L25.48,80.45L24.92,80.15L24.38,79.83L23.86,79.50L23.37,79.15L22.90,78.78L22.45,78.39L22.02,77.98L21.61,77.55L21.22,77.10L20.85,76.63L20.50,76.14L20.17,75.62L19.85,75.08L19.55,74.52L19.27,73.93L19.01,73.31L18.76,72.66L18.53,71.98L18.32,71.26L18.12,70.50L17.94,69.71L17.78,68.86L17.63,67.97L17.50,67.01L17.38,65.98L17.28,64.87L17.19,63.64L17.12,62.28L17.07,60.71L17.03,58.83L17.01,56.35L17.00,50.00L17.01,43.65L17.03,41.17L17.07,39.29L17.12,37.72L17.19,36.36L17.28,35.13L17.38,34.02L17.50,32.99L17.63,32.03L17.78,31.14L17.94,30.29L18.12,29.50L18.32,28.74L18.53,28.02L18.76,27.34L19.01,26.69L19.27,26.07L19.55,25.48L19.85,24.92L20.17,24.38L20.50,23.86L20.85,23.37L21.22,22.90L21.61,22.45L22.02,22.02L22.45,21.61L22.90,21.22L23.37,20.85L23.86,20.50L24.38,20.17L24.92,19.85L25.48,19.55L26.07,19.27L26.69,19.01L27.34,18.76L28.02,18.53L28.74,18.32L29.50,18.12L30.29,17.94L31.14,17.78L32.03,17.63L32.99,17.50L34.02,17.38L35.13,17.28L36.36,17.19L37.72,17.12L39.29,17.07L41.17,17.03L43.65,17.01L50.00,17.00L56.35,17.01L58.83,17.03L60.71,17.07L62.28,17.12L63.64,17.19L64.87,17.28L65.98,17.38L67.01,17.50L67.97,17.63L68.86,17.78L69.71,17.94L70.50,18.12L71.26,18.32L71.98,18.53L72.66,18.76L73.31,19.01L73.93,19.27L74.52,19.55L75.08,19.85L75.62,20.17L76.14,20.50L76.63,20.85L77.10,21.22L77.55,21.61L77.98,22.02L78.39,22.45L78.78,22.90L79.15,23.37L79.50,23.86L79.83,24.38L80.15,24.92L80.45,25.48L80.73,26.07L80.99,26.69L81.24,27.34L81.47,28.02L81.68,28.74L81.88,29.50L82.06,30.29L82.22,31.14L82.37,32.03L82.50,32.99L82.62,34.02L82.72,35.13L82.81,36.36L82.88,37.72L82.93,39.29L82.97,41.17L82.99,43.65Z" fill="#FF0033"/><polygon points="43.17,36.08 60.12,49.93 43.17,63.73" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.7" stroke-linejoin="round"/></svg>`,
    svg: null,
  },
  freeform: {
    bg: "",
    full: true,
    raw: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
<defs>
<linearGradient id="ios_freeform-bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#F6F6F6"/><stop offset="1" stop-color="#EAEAEA"/></linearGradient>
<linearGradient id="ios_freeform-org" gradientUnits="userSpaceOnUse" x1="0" y1="31.84" x2="0" y2="88.48">
<stop offset="0" stop-color="#FFA72E"/><stop offset=".28" stop-color="#F98A1C"/><stop offset=".46" stop-color="#F47B32"/><stop offset=".70" stop-color="#F27449"/><stop offset="1" stop-color="#F27866"/></linearGradient>
<linearGradient id="ios_freeform-orgrim" gradientUnits="userSpaceOnUse" x1="0" y1="31.84" x2="0" y2="88.48">
<stop offset="0" stop-color="#FFE0A8"/><stop offset=".5" stop-color="#FFBE86"/><stop offset="1" stop-color="#FFA694"/></linearGradient>
<linearGradient id="ios_freeform-blu" gradientUnits="userSpaceOnUse" x1="0" y1="13.67" x2="0" y2="67.19">
<stop offset="0" stop-color="#12DEFF"/><stop offset=".10" stop-color="#05D4FF"/><stop offset=".45" stop-color="#00C9F9"/><stop offset=".80" stop-color="#0DBAE8"/><stop offset="1" stop-color="#3AC6F0"/></linearGradient>
<linearGradient id="ios_freeform-blurim" gradientUnits="userSpaceOnUse" x1="0" y1="13.67" x2="0" y2="67.19">
<stop offset="0" stop-color="#46FFFF" stop-opacity=".95"/><stop offset=".14" stop-color="#7FF0FF" stop-opacity=".40"/><stop offset=".74" stop-color="#B6ECFF" stop-opacity=".22"/><stop offset="1" stop-color="#A9E6F5" stop-opacity=".15"/></linearGradient>
<linearGradient id="ios_freeform-ovl" gradientUnits="userSpaceOnUse" x1="0" y1="31" x2="0" y2="67.19">
<stop offset="0" stop-color="#04C8E6"/><stop offset=".13" stop-color="#03BEDA"/><stop offset=".30" stop-color="#01A6B0"/><stop offset=".46" stop-color="#0096A1"/><stop offset=".60" stop-color="#138B96"/><stop offset=".76" stop-color="#2A9DAB"/><stop offset=".92" stop-color="#419CA6"/><stop offset="1" stop-color="#4AA0A9"/></linearGradient>
<linearGradient id="ios_freeform-ink" gradientUnits="userSpaceOnUse" x1="20" y1="34" x2="70" y2="68">
<stop offset="0" stop-color="#475259"/><stop offset=".55" stop-color="#414B53"/><stop offset="1" stop-color="#3C464E"/></linearGradient>
<clipPath id="ios_freeform-crect"><rect x="32.42" y="13.67" width="53.91" height="53.52" rx="11.7" ry="11.7"/></clipPath>
<path id="ios_freeform-q" d="M 23.94 63.68 L 24.00 62.96 L 24.10 62.28 L 24.23 61.57 L 24.40 60.84 L 24.60 60.09 L 24.85 59.31 L 25.12 58.52 L 25.43 57.72 L 25.78 56.90 L 26.16 56.06 L 26.57 55.22 L 27.02 54.37 L 27.49 53.51 L 28.00 52.64 L 28.53 51.77 L 29.10 50.90 L 29.69 50.03 L 30.31 49.15 L 30.95 48.28 L 31.60 47.43 L 32.09 46.86 L 32.63 46.23 L 33.16 45.62 L 33.70 45.01 L 34.24 44.43 L 34.78 43.86 L 35.32 43.32 L 35.85 42.81 L 36.37 42.34 L 36.88 41.91 L 37.38 41.52 L 37.87 41.19 L 38.33 40.90 L 38.76 40.67 L 39.16 40.49 L 39.53 40.37 L 39.85 40.29 L 40.14 40.26 L 40.39 40.26 L 40.58 40.28 L 40.70 40.32 L 40.84 40.39 L 41.00 40.52 L 41.19 40.73 L 41.41 41.04 L 41.64 41.44 L 41.87 41.93 L 42.09 42.51 L 42.31 43.16 L 42.51 43.88 L 42.69 44.65 L 42.87 45.48 L 43.03 46.34 L 43.18 47.24 L 43.32 48.16 L 43.46 49.10 L 43.59 50.05 L 43.73 51.01 L 43.86 51.98 L 44.01 52.94 L 44.14 53.74 L 44.28 54.51 L 44.43 55.24 L 44.58 55.96 L 44.75 56.65 L 44.92 57.32 L 45.12 57.96 L 45.33 58.59 L 45.57 59.19 L 45.83 59.77 L 46.12 60.33 L 46.45 60.86 L 46.82 61.37 L 47.24 61.85 L 47.71 62.29 L 48.23 62.68 L 48.80 63.01 L 49.41 63.27 L 50.04 63.47 L 50.78 63.60 L 51.70 63.62 L 52.65 63.48 L 53.54 63.18 L 54.34 62.75 L 55.05 62.22 L 55.69 61.62 L 56.26 60.97 L 56.77 60.26 L 57.25 59.52 L 57.70 58.73 L 58.12 57.92 L 58.52 57.07 L 58.90 56.19 L 59.28 55.29 L 59.65 54.37 L 60.01 53.44 L 60.37 52.50 L 60.73 51.55 L 61.10 50.61 L 61.45 49.69 L 61.77 48.95 L 62.09 48.26 L 62.41 47.64 L 62.72 47.07 L 63.01 46.57 L 63.30 46.14 L 63.58 45.76 L 63.85 45.44 L 64.10 45.18 L 64.33 44.97 L 64.54 44.81 L 64.74 44.69 L 64.92 44.61 L 65.08 44.55 L 65.25 44.51 L 65.43 44.49 L 65.63 44.49 L 65.85 44.51 L 66.10 44.56 L 66.37 44.64 L 66.59 44.72 L 66.77 44.81 L 66.96 44.93 L 67.15 45.08 L 67.34 45.26 L 67.54 45.48 L 67.74 45.75 L 67.94 46.04 L 68.14 46.38 L 68.34 46.75 L 68.53 47.15 L 68.72 47.59 L 68.91 48.05 L 69.10 48.54 L 69.29 49.05 L 69.47 49.58 L 69.66 50.13 L 69.85 50.70 L 70.04 51.28 L 70.22 51.83 L 70.36 52.37 L 70.51 52.91 L 70.64 53.43 L 70.77 53.92 L 70.89 54.39 L 71.01 54.83 L 71.12 55.26 L 71.24 55.66 L 71.37 56.05 L 71.50 56.42 L 71.65 56.78 L 71.82 57.13 L 72.03 57.47 L 72.27 57.80 L 72.56 58.11 L 72.91 58.38 L 73.31 58.60 L 73.73 58.76 L 74.17 58.84 L 74.64 58.86 L 75.12 58.81 L 75.55 58.71 L 75.97 58.57 L 76.36 58.40 L 76.74 58.21 L 77.10 57.98 L 77.45 57.74 L 77.78 57.47 L 78.10 57.19 L 78.41 56.89 L 78.71 56.58 L 79.01 56.25 L 79.30 55.92 L 79.58 55.57 L 79.86 55.21 L 80.13 54.84 L 80.40 54.47 L 80.67 54.09 L 80.93 53.71 L 81.16 53.37 L 81.59 52.83 L 82.04 52.29 L 82.49 51.76 L 82.94 51.25 L 83.40 50.75 L 83.86 50.27 L 84.32 49.80 L 84.79 49.35 L 85.25 48.91 L 85.72 48.48 L 86.18 48.07 L 86.65 47.67 L 87.11 47.29 L 87.58 46.91 L 88.05 46.55 L 88.51 46.20 L 88.97 45.86 L 89.44 45.53 L 89.90 45.21 L 90.37 44.92 A 0.72 0.72 0 0 0 89.63 43.68 L 89.14 43.97 L 88.63 44.25 L 88.12 44.55 L 87.61 44.86 L 87.09 45.18 L 86.57 45.51 L 86.05 45.86 L 85.53 46.22 L 85.01 46.60 L 84.48 46.99 L 83.96 47.40 L 83.43 47.82 L 82.91 48.26 L 82.38 48.71 L 81.86 49.19 L 81.34 49.67 L 80.82 50.18 L 80.30 50.71 L 79.78 51.25 L 79.24 51.83 L 78.93 52.24 L 78.65 52.59 L 78.38 52.93 L 78.11 53.26 L 77.84 53.57 L 77.57 53.87 L 77.31 54.16 L 77.05 54.43 L 76.79 54.68 L 76.54 54.91 L 76.29 55.12 L 76.05 55.30 L 75.82 55.46 L 75.60 55.60 L 75.39 55.71 L 75.19 55.80 L 75.01 55.87 L 74.84 55.91 L 74.68 55.93 L 74.56 55.94 L 74.54 55.93 L 74.54 55.92 L 74.56 55.93 L 74.59 55.94 L 74.61 55.94 L 74.60 55.92 L 74.57 55.86 L 74.51 55.75 L 74.45 55.59 L 74.37 55.38 L 74.29 55.12 L 74.21 54.82 L 74.13 54.47 L 74.04 54.09 L 73.95 53.66 L 73.86 53.20 L 73.76 52.70 L 73.65 52.17 L 73.52 51.60 L 73.38 50.97 L 73.21 50.33 L 73.04 49.73 L 72.87 49.14 L 72.70 48.55 L 72.53 47.97 L 72.35 47.40 L 72.16 46.84 L 71.96 46.29 L 71.74 45.75 L 71.51 45.22 L 71.27 44.71 L 71.00 44.21 L 70.70 43.73 L 70.38 43.27 L 70.02 42.83 L 69.62 42.41 L 69.18 42.03 L 68.69 41.69 L 68.17 41.39 L 67.63 41.16 L 67.07 40.98 L 66.51 40.84 L 65.93 40.76 L 65.34 40.74 L 64.75 40.78 L 64.16 40.88 L 63.58 41.06 L 63.02 41.30 L 62.48 41.60 L 61.97 41.95 L 61.48 42.36 L 61.02 42.81 L 60.58 43.30 L 60.15 43.84 L 59.74 44.43 L 59.33 45.06 L 58.93 45.74 L 58.54 46.47 L 58.14 47.26 L 57.75 48.11 L 57.33 49.09 L 56.94 50.04 L 56.55 50.98 L 56.17 51.90 L 55.79 52.79 L 55.42 53.66 L 55.05 54.48 L 54.69 55.26 L 54.32 55.99 L 53.95 56.67 L 53.59 57.27 L 53.24 57.80 L 52.90 58.24 L 52.57 58.60 L 52.28 58.87 L 52.02 59.04 L 51.81 59.15 L 51.64 59.20 L 51.47 59.22 L 51.22 59.20 L 51.11 59.17 L 50.96 59.12 L 50.84 59.06 L 50.72 58.98 L 50.60 58.89 L 50.47 58.76 L 50.34 58.60 L 50.20 58.39 L 50.05 58.14 L 49.90 57.83 L 49.75 57.48 L 49.60 57.07 L 49.45 56.62 L 49.32 56.12 L 49.18 55.57 L 49.05 54.99 L 48.93 54.36 L 48.81 53.69 L 48.70 52.99 L 48.59 52.26 L 48.47 51.35 L 48.36 50.40 L 48.24 49.44 L 48.12 48.47 L 48.00 47.50 L 47.86 46.52 L 47.72 45.55 L 47.56 44.59 L 47.37 43.65 L 47.17 42.72 L 46.93 41.81 L 46.66 40.93 L 46.35 40.08 L 45.98 39.25 L 45.54 38.46 L 45.02 37.70 L 44.39 37.00 L 43.65 36.38 L 42.79 35.87 L 41.82 35.52 L 40.86 35.35 L 39.96 35.32 L 39.08 35.40 L 38.23 35.58 L 37.42 35.84 L 36.64 36.16 L 35.88 36.55 L 35.16 36.98 L 34.45 37.45 L 33.77 37.96 L 33.10 38.51 L 32.44 39.08 L 31.80 39.67 L 31.17 40.28 L 30.55 40.91 L 29.94 41.55 L 29.35 42.19 L 28.77 42.84 L 28.20 43.48 L 27.60 44.17 L 26.83 45.12 L 26.11 46.07 L 25.42 47.01 L 24.75 47.97 L 24.11 48.93 L 23.49 49.89 L 22.91 50.85 L 22.35 51.81 L 21.83 52.77 L 21.34 53.74 L 20.88 54.70 L 20.46 55.66 L 20.07 56.61 L 19.72 57.56 L 19.41 58.51 L 19.13 59.46 L 18.90 60.40 L 18.71 61.33 L 18.56 62.27 L 18.46 63.12 A 2.75 2.75 0 0 0 23.94 63.68 Z"/>
<clipPath id="ios_freeform-cink"><use href="#ios_freeform-q" xlink:href="#ios_freeform-q"/></clipPath>
<filter id="ios_freeform-glowO" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
<filter id="ios_freeform-glowB" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.56"/></filter>
<filter id="ios_freeform-sh" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="1.35"/></filter>
<filter id="ios_freeform-soft" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="0.55"/></filter>
</defs>

<rect width="100" height="100" fill="url(#ios_freeform-bg)"/>

<!-- orange disc -->
<circle cx="40.55" cy="61.66" r="28.32" fill="#F0907A" opacity=".37" filter="url(#ios_freeform-glowO)"/>
<circle cx="39.45" cy="60.16" r="28.32" fill="url(#ios_freeform-org)"/>
<circle cx="39.45" cy="60.16" r="26.87" fill="none" stroke="url(#ios_freeform-orgrim)" stroke-width="1.7" opacity="0.50" filter="url(#ios_freeform-soft)"/>

<!-- blue sheet -->
<rect x="32.72" y="15.27" width="53.91" height="53.52" rx="11.7" fill="#93A8B2" opacity=".22" filter="url(#ios_freeform-glowB)"/>
<rect x="33.57" y="14.87" width="53.91" height="53.52" rx="11.7" fill="#84DCF0" opacity=".50" filter="url(#ios_freeform-glowB)"/>
<rect x="32.42" y="13.67" width="53.91" height="53.52" rx="11.7" fill="url(#ios_freeform-blu)"/>
<g clip-path="url(#ios_freeform-crect)"><circle cx="39.45" cy="60.16" r="28.32" fill="url(#ios_freeform-ovl)"/></g>
<rect x="33.17" y="14.42" width="52.41" height="52.02" rx="10.95" fill="none" stroke="url(#ios_freeform-blurim)" stroke-width="1.5"/>

<!-- squiggle -->
<g style="isolation:isolate;mix-blend-mode:multiply">
 <use href="#ios_freeform-q" xlink:href="#ios_freeform-q" transform="translate(0.6 1.8)" fill="#9AA1A7" opacity=".30" filter="url(#ios_freeform-sh)"/>
 <g clip-path="url(#ios_freeform-cink)">
  <use href="#ios_freeform-q" xlink:href="#ios_freeform-q" fill="url(#ios_freeform-ink)"/>
  <use href="#ios_freeform-q" xlink:href="#ios_freeform-q" fill="none" stroke="#4A555E" stroke-width="1.3"/>
  <use href="#ios_freeform-q" xlink:href="#ios_freeform-q" fill="none" stroke="#6F7E88" stroke-width="1.15" transform="translate(0.2 0.6)"/>
 </g>
</g>
</svg>`,
    svg: null,
  },
  sam_calculator: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"> <defs> <linearGradient id="sam_calculator-bg" x1="0" y1="0" x2="0.4" y2="1"> <stop offset="0" stop-color="#93C001"/> <stop offset="0.55" stop-color="#7DAB00"/> <stop offset="1" stop-color="#6D9800"/> </linearGradient> <radialGradient id="sam_calculator-hl" cx="0.22" cy="0.16" r="0.85"> <stop offset="0" stop-color="#fff" stop-opacity="0.30"/> <stop offset="0.55" stop-color="#fff" stop-opacity="0.09"/> <stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_calculator-sh" cx="0.86" cy="0.9" r="0.8"> <stop offset="0" stop-color="#000" stop-opacity="0.20"/> <stop offset="0.55" stop-color="#000" stop-opacity="0.07"/> <stop offset="1" stop-color="#000" stop-opacity="0"/> </radialGradient> <filter id="sam_calculator-gs" x="-40%" y="-40%" width="180%" height="180%"> <feDropShadow dx="0.8" dy="1.3" stdDeviation="1.5" flood-color="#2E4A00" flood-opacity="0.30"/> </filter> </defs> <rect width="100" height="100" fill="url(#sam_calculator-bg)"/> <rect width="100" height="100" fill="url(#sam_calculator-hl)"/><rect width="100" height="100" fill="url(#sam_calculator-sh)"/> <g filter="url(#sam_calculator-gs)"> <g fill="#FFFFFF"> <rect x="30.5" y="23" width="9" height="22.5" rx="4.5"/> <rect x="23.5" y="29.5" width="23" height="9" rx="4.5"/> <rect x="53.5" y="29.5" width="23" height="9" rx="4.5"/> <rect x="23.5" y="57.5" width="23" height="9" rx="4.5" transform="rotate(45 35 62)"/> <rect x="23.5" y="57.5" width="23" height="9" rx="4.5" transform="rotate(-45 35 62)"/> </g> <g fill="#2C6B10"> <rect x="53.5" y="57.5" width="23" height="9" rx="4.5"/> <circle cx="65" cy="50.5" r="5.5"/> <circle cx="65" cy="73.5" r="5.5"/> </g> </g> </svg>`,
    svg: null,
  },
  sam_calendar: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sam_calendar-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4e6ef"/></linearGradient><linearGradient id="sam_calendar-band" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2fd3c6"/><stop offset="1" stop-color="#00a8ae"/></linearGradient><radialGradient id="sam_calendar-hi" cx="0.24" cy="0.16" r="0.85"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><radialGradient id="sam_calendar-sh" cx="0.82" cy="0.86" r="0.8"><stop offset="0" stop-color="#28303f" stop-opacity="0.18"/><stop offset="1" stop-color="#28303f" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#sam_calendar-bg)"/><rect width="100" height="40" fill="url(#sam_calendar-band)"/><rect y="40" width="100" height="3" fill="#000" opacity="0.10"/><rect x="24" y="36" width="7" height="9" rx="3.5" fill="#00979e"/><rect x="69" y="36" width="7" height="9" rx="3.5" fill="#00979e"/><g fill="none" stroke="#ffffff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"><path d="M24 20 H38"/><path d="M31 20 V33"/><path d="M44.5 20 V33"/><path d="M56.5 20 V33"/><path d="M44.5 26.5 H56.5"/><path d="M63.5 20 V26.6 a6 6 0 0 0 12 0 V20"/></g><g transform="translate(50 66) scale(0.8) translate(-50 -66)"><g fill="none" stroke="#000000" stroke-opacity="0.14" stroke-width="11.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(1.6,1.6)"><path d="M33 62 A17 15 0 1 1 66 66.5 C66 74 58 78 34 88 H68"/></g><g fill="none" stroke="#16181d" stroke-width="11.5" stroke-linecap="round" stroke-linejoin="round"><path d="M33 62 A17 15 0 1 1 66 66.5 C66 74 58 78 34 88 H68"/></g></g><rect width="100" height="100" fill="url(#sam_calendar-hi)"/><rect width="100" height="100" fill="url(#sam_calendar-sh)"/></svg>`,
    svg: null,
  },
  sam_camera: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sam_camera-bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#CFD5EE"/>
  <stop offset="0.55" stop-color="#B6BEE0"/>
  <stop offset="1" stop-color="#9AA4CC"/>
</linearGradient>
<linearGradient id="sam_camera-body" x1="0.2" y1="0" x2="0.85" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="1" stop-color="#EDEAF3"/>
</linearGradient>
<radialGradient id="sam_camera-lens" cx="0.42" cy="0.36" r="0.75">
  <stop offset="0" stop-color="#3B3B44"/>
  <stop offset="0.6" stop-color="#15151A"/>
  <stop offset="1" stop-color="#08080B"/>
</radialGradient>
<linearGradient id="sam_camera-iris" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#1EC8D8"/>
  <stop offset="0.55" stop-color="#1E6FA8"/>
  <stop offset="1" stop-color="#101018"/>
</linearGradient>

<radialGradient id="sam_camera-hi" cx="0.26" cy="0.18" r="0.85">
  <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
  <stop offset="0.55" stop-color="#fff" stop-opacity="0.07"/>
  <stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<radialGradient id="sam_camera-sh" cx="0.82" cy="0.86" r="0.8">
  <stop offset="0" stop-color="#000" stop-opacity="0.17"/>
  <stop offset="0.6" stop-color="#000" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
<filter id="sam_camera-gs" x="-30%" y="-30%" width="170%" height="170%">
  <feDropShadow dx="0.9" dy="1.4" stdDeviation="1.5" flood-color="#000" flood-opacity="0.22"/>
</filter>
</defs>
<rect width="100" height="100" fill="url(#sam_camera-bg)"/>
<rect width="100" height="100" fill="url(#sam_camera-hi)"/><rect width="100" height="100" fill="url(#sam_camera-sh)"/>
<g filter="url(#sam_camera-gs)">
  <rect x="21" y="24" width="58" height="54" rx="16" fill="url(#sam_camera-body)"/>
</g>
<circle cx="32.5" cy="35" r="3.4" fill="#E23B3B"/>
<circle cx="52" cy="52" r="17" fill="url(#sam_camera-lens)"/>
<circle cx="52" cy="52" r="11" fill="url(#sam_camera-iris)"/>
<circle cx="53" cy="53" r="5.8" fill="#0B0B10"/>
<path d="M45 45 A 10 10 0 0 1 53 41.6" fill="none" stroke="#6EE8F2" stroke-width="2.6" stroke-linecap="round" opacity="0.85"/>
</svg>`,
    svg: null,
  },
  sam_files: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"> <defs> <linearGradient id="sam_files-bg" x1="0" y1="0" x2="0.35" y2="1"> <stop offset="0" stop-color="#F7CE00"/> <stop offset="0.5" stop-color="#F2A800"/> <stop offset="1" stop-color="#E98A00"/> </linearGradient> <radialGradient id="sam_files-hl" cx="0.22" cy="0.16" r="0.85"> <stop offset="0" stop-color="#fff" stop-opacity="0.30"/> <stop offset="0.55" stop-color="#fff" stop-opacity="0.09"/> <stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_files-sh" cx="0.86" cy="0.9" r="0.8"> <stop offset="0" stop-color="#000" stop-opacity="0.20"/> <stop offset="0.55" stop-color="#000" stop-opacity="0.07"/> <stop offset="1" stop-color="#000" stop-opacity="0"/> </radialGradient> <filter id="sam_files-gs" x="-30%" y="-30%" width="160%" height="160%"> <feDropShadow dx="0.9" dy="1.4" stdDeviation="1.6" flood-color="#8A4E00" flood-opacity="0.28"/> </filter> <linearGradient id="sam_files-tab" x1="0" y1="0" x2="0.3" y2="1"> <stop offset="0" stop-color="#FBEBB6"/><stop offset="1" stop-color="#F5DE9B"/> </linearGradient> <linearGradient id="sam_files-fr" x1="0.1" y1="0" x2="0.6" y2="1"> <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F7F4EE"/> </linearGradient> </defs> <rect width="100" height="100" fill="url(#sam_files-bg)"/> <rect width="100" height="100" fill="url(#sam_files-hl)"/><rect width="100" height="100" fill="url(#sam_files-sh)"/> <g filter="url(#sam_files-gs)"> <path d="M17 30.5a6.5 6.5 0 0 1 6.5-6.5h17.2c2.1 0 4.1 1 5.4 2.7l1.7 2.3c0.5 0.7 1.3 1.1 2.1 1.1H76.5A6.5 6.5 0 0 1 83 36.6V70a6.5 6.5 0 0 1-6.5 6.5h-53A6.5 6.5 0 0 1 17 70Z" fill="url(#sam_files-tab)"/> <path d="M17 35h66v35a6.5 6.5 0 0 1-6.5 6.5h-53A6.5 6.5 0 0 1 17 70Z" fill="url(#sam_files-fr)"/> </g> <path d="M17 35h66v1.6H17Z" fill="#000" opacity="0.05"/> </svg>`,
    svg: null,
  },
  sam_galaxystore: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"> <defs> <linearGradient id="sam_galaxystore-bg" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#FF3D8E"/><stop offset=".45" stop-color="#FA1D5C"/><stop offset="1" stop-color="#D80A1E"/> </linearGradient> <radialGradient id="sam_galaxystore-hl" cx=".26" cy=".2" r=".62"> <stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_galaxystore-sh" cx=".82" cy=".86" r=".6"> <stop offset="0" stop-color="#4A0010" stop-opacity=".36"/><stop offset="1" stop-color="#4A0010" stop-opacity="0"/> </radialGradient> <linearGradient id="sam_galaxystore-bag" x1=".15" y1="0" x2=".9" y2="1"> <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EBD9E2"/> </linearGradient> <filter id="sam_galaxystore-soft" x="-30%" y="-30%" width="160%" height="160%"> <feGaussianBlur stdDeviation="2.4"/></filter> </defs> <rect width="100" height="100" fill="url(#sam_galaxystore-bg)"/> <rect width="100" height="100" fill="url(#sam_galaxystore-hl)"/> <rect width="100" height="100" fill="url(#sam_galaxystore-sh)"/> <g filter="url(#sam_galaxystore-soft)" opacity=".33" transform="translate(1.8 2.2)"> <path d="M39.5 48.5V40.5a10.5 10.5 0 0 1 21 0v8" fill="none" stroke="#54000E" stroke-width="5" stroke-linecap="round"/> <rect x="26" y="46" width="48" height="34" rx="6" fill="#54000E"/> </g> <path d="M39.5 48.5V40.5a10.5 10.5 0 0 1 21 0v8" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/> <rect x="26" y="46" width="48" height="34" rx="6" fill="url(#sam_galaxystore-bag)"/> <g fill="#E4C3D0"> <circle cx="37" cy="55" r="2.7"/><circle cx="63" cy="55" r="2.7"/> </g> </svg>`,
    svg: null,
  },
  sam_gallery: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"> <defs> <linearGradient id="sam_gallery-bg" x1="0.02" y1="0.2" x2="1" y2="0.85"> <stop offset="0" stop-color="#A81BE4"/><stop offset=".34" stop-color="#E3159C"/> <stop offset=".62" stop-color="#F23E5C"/><stop offset=".86" stop-color="#FA7A16"/><stop offset="1" stop-color="#FC9A0C"/> </linearGradient> <radialGradient id="sam_gallery-hl" cx=".26" cy=".2" r=".62"> <stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_gallery-sh" cx=".82" cy=".86" r=".6"> <stop offset="0" stop-color="#3A0016" stop-opacity=".34"/><stop offset="1" stop-color="#3A0016" stop-opacity="0"/> </radialGradient> <linearGradient id="sam_gallery-pet" x1=".2" y1="0" x2=".85" y2="1"> <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#F3DCEA"/> </linearGradient> <radialGradient id="sam_gallery-ctr" cx=".35" cy=".3" r=".85"> <stop offset="0" stop-color="#FF9A32"/><stop offset="1" stop-color="#F0521A"/> </radialGradient> <filter id="sam_gallery-soft" x="-30%" y="-30%" width="160%" height="160%"> <feGaussianBlur stdDeviation="2.2"/></filter> </defs> <rect width="100" height="100" fill="url(#sam_gallery-bg)"/> <rect width="100" height="100" fill="url(#sam_gallery-hl)"/> <rect width="100" height="100" fill="url(#sam_gallery-sh)"/> <g transform="translate(50 50)"> <g filter="url(#sam_gallery-soft)" opacity=".3"> <g transform="translate(1.6 2)" fill="#6B0030"> <g><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> <g transform="rotate(72)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> <g transform="rotate(144)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> <g transform="rotate(216)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> <g transform="rotate(288)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> </g></g> <g fill="url(#sam_gallery-pet)" transform="rotate(-9)"> <ellipse cx="0" cy="-20" rx="12" ry="16.4"/> <g transform="rotate(72)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> <g transform="rotate(144)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> <g transform="rotate(216)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> <g transform="rotate(288)"><ellipse cx="0" cy="-20" rx="12" ry="16.4"/></g> </g> <circle cx="0" cy="0" r="8.4" fill="url(#sam_gallery-ctr)"/> </g> </svg>`,
    svg: null,
  },
  sam_gemini: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs> <linearGradient id="sam_gemini-bg" x1="0" y1="0" x2="0.4" y2="1"> <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F2F4"/> </linearGradient> <radialGradient id="sam_gemini-hl" cx="0.22" cy="0.16" r="0.85"> <stop offset="0" stop-color="#fff" stop-opacity="0.30"/> <stop offset="0.55" stop-color="#fff" stop-opacity="0.09"/> <stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_gemini-sh" cx="0.86" cy="0.9" r="0.8"> <stop offset="0" stop-color="#000" stop-opacity="0.20"/> <stop offset="0.55" stop-color="#000" stop-opacity="0.07"/> <stop offset="1" stop-color="#000" stop-opacity="0"/> </radialGradient> <linearGradient id="sam_gemini-base" x1="0.05" y1="1" x2="0.95" y2="0.1"> <stop offset="0" stop-color="#2AAE5F"/> <stop offset="0.42" stop-color="#3F86F0"/> <stop offset="1" stop-color="#6FA8FB"/> </linearGradient> <radialGradient id="sam_gemini-red" cx="0.5" cy="0.02" r="0.58"> <stop offset="0" stop-color="#EA4335" stop-opacity="1"/> <stop offset="0.55" stop-color="#EA4335" stop-opacity="0.55"/> <stop offset="1" stop-color="#EA4335" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_gemini-yel" cx="0.03" cy="0.5" r="0.55"> <stop offset="0" stop-color="#F7D046" stop-opacity="1"/> <stop offset="0.5" stop-color="#F5C518" stop-opacity="0.62"/> <stop offset="1" stop-color="#F5C518" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_gemini-grn" cx="0.5" cy="0.97" r="0.45"> <stop offset="0" stop-color="#34C176" stop-opacity="0.95"/> <stop offset="1" stop-color="#34C176" stop-opacity="0"/> </radialGradient> <clipPath id="sam_gemini-clip"><path d="M50 2.5 C55.5 29 71 45 97.5 50 C71 55 55.5 71 50 97.5 C44.5 71 29 55 2.5 50 C29 45 44.5 29 50 2.5 Z"/></clipPath> </defs>  <rect width="100" height="100" fill="url(#sam_gemini-bg)"/> <rect width="100" height="100" fill="url(#sam_gemini-hl)"/><rect width="100" height="100" fill="url(#sam_gemini-sh)"/><g transform="translate(50 50) scale(0.8) translate(-50 -50)"> <g clip-path="url(#sam_gemini-clip)"> <rect width="100" height="100" fill="url(#sam_gemini-base)"/> <rect width="100" height="100" fill="url(#sam_gemini-red)"/> <rect width="100" height="100" fill="url(#sam_gemini-yel)"/> <rect width="100" height="100" fill="url(#sam_gemini-grn)"/> </g> </g></svg>`,
    svg: null,
  },
  sam_health: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sam_health-bg" x1="0.05" y1="1" x2="0.95" y2="0">
  <stop offset="0" stop-color="#0A7BE8"/>
  <stop offset="0.35" stop-color="#0FB6C8"/>
  <stop offset="0.68" stop-color="#22CE74"/>
  <stop offset="1" stop-color="#7CE022"/>
</linearGradient>
<linearGradient id="sam_health-fig" x1="0.3" y1="0" x2="0.6" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="1" stop-color="#EAF6FF"/>
</linearGradient>

<radialGradient id="sam_health-hi" cx="0.26" cy="0.18" r="0.85">
  <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
  <stop offset="0.55" stop-color="#fff" stop-opacity="0.07"/>
  <stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<radialGradient id="sam_health-sh" cx="0.82" cy="0.86" r="0.8">
  <stop offset="0" stop-color="#000" stop-opacity="0.17"/>
  <stop offset="0.6" stop-color="#000" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
<filter id="sam_health-gs" x="-30%" y="-30%" width="170%" height="170%">
  <feDropShadow dx="0.9" dy="1.4" stdDeviation="1.5" flood-color="#000" flood-opacity="0.22"/>
</filter>
</defs>
<rect width="100" height="100" fill="url(#sam_health-bg)"/>
<rect width="100" height="100" fill="url(#sam_health-hi)"/><rect width="100" height="100" fill="url(#sam_health-sh)"/>
<g filter="url(#sam_health-gs)" fill="url(#sam_health-fig)">
  <!-- head -->
  <path d="M52 15 C 62 15, 68 22, 68 31 C 68 40, 63 46, 55 46 C 46 46, 41 39, 41 30 C 41 21, 45 15, 52 15 Z"/>
  <!-- ponytail -->
  <path d="M45 34 C 38 33, 30 36, 26 41 C 24 44, 26 47, 30 46 C 36 45, 42 43, 47 41 Z"/>
  <!-- torso and thigh mass -->
  <path d="M46 44 C 36 50, 28 61, 24 72 C 21 80, 26 86, 34 86 L 57 86 C 67 86, 72 79, 70 70 L 65 49 C 62 43, 51 41, 46 44 Z"/>
  <!-- upper arm -->
  <path d="M64 50 L 75 65" fill="none" stroke="url(#sam_health-fig)" stroke-width="12" stroke-linecap="round"/>
  <!-- forearm -->
  <path d="M75 65 L 71 55" fill="none" stroke="url(#sam_health-fig)" stroke-width="11" stroke-linecap="round"/>
  <!-- fist -->
  <circle cx="70" cy="53" r="7.2"/>
</g>
<!-- armpit wedge cut, painted with the tile gradient -->
<path d="M33.5 61 L 43.5 68 L 36 80 C 31 74, 31 66, 33.5 61 Z" fill="url(#sam_health-bg)"/>
<!-- wrist band -->
<path d="M73.5 61.5 L 79 65" stroke="#8FE9E0" stroke-width="4" stroke-linecap="round" opacity="0.9"/>
</svg>`,
    svg: null,
  },
  sam_internet: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><defs><linearGradient id="sam_internet-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2ff0"/><stop offset="1" stop-color="#1c0aa8"/></linearGradient><linearGradient id="sam_internet-p" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d5dcf5"/></linearGradient><linearGradient id="sam_internet-r" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#7fd8ff"/></linearGradient><filter id="sam_internet-blur" x="-60" y="-60" width="220" height="220" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="13"/></filter><filter id="sam_internet-sh" x="-60" y="-60" width="220" height="220" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2"/></filter><circle id="sam_internet-c" cx="49" cy="52" r="26.5"/><mask id="sam_internet-m"><use href="#sam_internet-c" fill="#fff"/></mask><clipPath id="sam_internet-back"><rect x="0" y="0" width="100" height="52"/></clipPath><clipPath id="sam_internet-front"><rect x="0" y="52" width="100" height="48"/></clipPath></defs><rect width="100" height="100" fill="url(#sam_internet-bg)"/><g filter="url(#sam_internet-blur)"><ellipse cx="18" cy="14" rx="54" ry="48" fill="#fff" opacity=".2"/><ellipse cx="86" cy="90" rx="54" ry="48" fill="#080046" opacity=".32"/></g><g clip-path="url(#sam_internet-back)"><ellipse cx="49" cy="52" rx="34" ry="12.5" fill="none" stroke="url(#sam_internet-r)" stroke-width="7.5" transform="rotate(-38 49 52)"/></g><use href="#sam_internet-c" fill="url(#sam_internet-p)"/><g mask="url(#sam_internet-m)"><g filter="url(#sam_internet-sh)"><circle cx="53" cy="56" r="26.5" fill="none" stroke="#5560a0" stroke-width="7.5" opacity=".45"/><circle cx="45" cy="47" r="26.5" fill="none" stroke="#ffffff" stroke-width="7" opacity=".8"/></g></g><g clip-path="url(#sam_internet-front)"><ellipse cx="49" cy="52" rx="34" ry="12.5" fill="none" stroke="url(#sam_internet-r)" stroke-width="7.5" transform="rotate(-38 49 52)"/></g></svg>`,
    svg: null,
  },
  sam_messages: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><defs><linearGradient id="sam_messages-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe0ee"/></linearGradient><linearGradient id="sam_messages-b" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#3f74ff"/><stop offset="1" stop-color="#0b34e8"/></linearGradient><filter id="sam_messages-blur" x="-60" y="-60" width="220" height="220" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="13"/></filter><filter id="sam_messages-sh" x="-60" y="-60" width="220" height="220" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2.2"/></filter><path id="sam_messages-g" d="M51 18 C74 18 90 30 90 47 C90 64 74 75.5 51 75.5 C46 75.5 41.5 75.1 37.4 74.2 L37.4 88 C37.4 90.6 34.5 91.9 32.7 90.1 C28.7 86.2 24.6 81 22.4 76.7 C16.2 71.6 12 60.4 12 47 C12 30 28 18 51 18 Z"/><mask id="sam_messages-m"><use href="#sam_messages-g" fill="#fff"/></mask></defs><rect width="100" height="100" fill="url(#sam_messages-bg)"/><g filter="url(#sam_messages-blur)"><ellipse cx="18" cy="14" rx="54" ry="48" fill="#fff" opacity=".5"/><ellipse cx="88" cy="92" rx="54" ry="48" fill="#6a6a90" opacity=".26"/></g><use href="#sam_messages-g" fill="url(#sam_messages-b)"/><g mask="url(#sam_messages-m)"><g filter="url(#sam_messages-sh)"><use href="#sam_messages-g" transform="translate(3 3)" fill="none" stroke="#0a1f8c" stroke-width="7" opacity=".5"/><use href="#sam_messages-g" transform="translate(-2.5 -2.5)" fill="none" stroke="#a8c0ff" stroke-width="5" opacity=".45"/></g></g></svg>`,
    svg: null,
  },
  sam_notes: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"> <defs> <linearGradient id="sam_notes-bg" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#FF3B32"/><stop offset=".5" stop-color="#F01A22"/><stop offset="1" stop-color="#C50C16"/> </linearGradient> <radialGradient id="sam_notes-hl" cx=".26" cy=".2" r=".62"> <stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_notes-sh" cx=".82" cy=".86" r=".6"> <stop offset="0" stop-color="#4A0006" stop-opacity=".36"/><stop offset="1" stop-color="#4A0006" stop-opacity="0"/> </radialGradient> <linearGradient id="sam_notes-pg" x1=".15" y1="0" x2=".9" y2="1"> <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E6E2EC"/> </linearGradient> <filter id="sam_notes-soft" x="-30%" y="-30%" width="160%" height="160%"> <feGaussianBlur stdDeviation="2.4"/></filter> </defs> <rect width="100" height="100" fill="url(#sam_notes-bg)"/> <rect width="100" height="100" fill="url(#sam_notes-hl)"/> <rect width="100" height="100" fill="url(#sam_notes-sh)"/> <g filter="url(#sam_notes-soft)" opacity=".32" fill="#5A0008" transform="translate(1.8 2.2)"> <rect x="22" y="26" width="15" height="9.5" rx="4.75"/><rect x="22" y="41.5" width="15" height="9.5" rx="4.75"/> <rect x="22" y="57" width="15" height="9.5" rx="4.75"/><rect x="22" y="72.5" width="15" height="9.5" rx="4.75"/> <path d="M29 22h49a3 3 0 0 1 3 3v40L62 84H29Z"/> </g> <g fill="url(#sam_notes-pg)"> <rect x="22" y="26" width="15" height="9.5" rx="4.75"/><rect x="22" y="41.5" width="15" height="9.5" rx="4.75"/> <rect x="22" y="57" width="15" height="9.5" rx="4.75"/><rect x="22" y="72.5" width="15" height="9.5" rx="4.75"/> </g> <g fill="#D01018" opacity=".85"> <rect x="25.5" y="28.6" width="7.5" height="4.2" rx="2.1"/><rect x="25.5" y="44.1" width="7.5" height="4.2" rx="2.1"/> <rect x="25.5" y="59.6" width="7.5" height="4.2" rx="2.1"/><rect x="25.5" y="75.1" width="7.5" height="4.2" rx="2.1"/> </g> <path d="M33 22h45a3 3 0 0 1 3 3v40L62 84H33a3 3 0 0 1-3-3V25a3 3 0 0 1 3-3Z" fill="url(#sam_notes-pg)"/> <path d="M81 65H67a5 5 0 0 0-5 5v14Z" fill="#C9C3D4"/> </svg>`,
    svg: null,
  },
  sam_phone: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sam_phone-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ED44A"/><stop offset="0.5" stop-color="#1FC02F"/><stop offset="1" stop-color="#0E9C22"/></linearGradient><radialGradient id="sam_phone-hi" cx="0.26" cy="0.18" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><radialGradient id="sam_phone-lo" cx="0.82" cy="0.86" r="0.8"><stop offset="0" stop-color="#000" stop-opacity="0.17"/><stop offset="0.6" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><filter id="sam_phone-gs" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="0.8" dy="1.3" stdDeviation="1.4" flood-color="#04380d" flood-opacity="0.28"/></filter></defs><rect width="100" height="100" fill="url(#sam_phone-bg)"/><rect width="100" height="100" fill="url(#sam_phone-hi)"/><rect width="100" height="100" fill="url(#sam_phone-lo)"/><g filter="url(#sam_phone-gs)" transform="translate(50 50) scale(2.7) translate(-12 -12)"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" fill="#FFFFFF"/></g></svg>`,
    svg: null,
  },
  sam_playstore: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sam_playstore-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6e9f0"/></linearGradient><radialGradient id="sam_playstore-hi" cx="0.24" cy="0.18" r="0.85"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><radialGradient id="sam_playstore-sh" cx="0.82" cy="0.86" r="0.8"><stop offset="0" stop-color="#2a3140" stop-opacity="0.16"/><stop offset="1" stop-color="#2a3140" stop-opacity="0"/></radialGradient><linearGradient id="sam_playstore-blue" x1="0.1" y1="0.1" x2="0.9" y2="0.9"><stop offset="0" stop-color="#00a0ff"/><stop offset="1" stop-color="#0059d6"/></linearGradient><linearGradient id="sam_playstore-green" x1="0.1" y1="0.2" x2="0.9" y2="0.9"><stop offset="0" stop-color="#00c25b"/><stop offset="1" stop-color="#00a352"/></linearGradient><linearGradient id="sam_playstore-yellow" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffd400"/><stop offset="1" stop-color="#ffab00"/></linearGradient><linearGradient id="sam_playstore-red" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ff4442"/><stop offset="1" stop-color="#e5231f"/></linearGradient></defs><rect width="100" height="100" fill="url(#sam_playstore-bg)"/><rect width="100" height="100" fill="url(#sam_playstore-hi)"/><rect width="100" height="100" fill="url(#sam_playstore-sh)"/><g transform="translate(50 50) scale(0.84) translate(-53.5 -50)"><g transform="translate(1.4,1.4)" opacity="0.13"><path d="M28 16 C24.5 19 24.5 81 28 84 L52 50 Z" fill="#000"/><path d="M28 16 L72 35 L83 50 L72 65 L28 84 Z" fill="#000"/></g><path d="M28 16 C24.3 19.2 24.3 80.8 28 84 L52 50 Z" fill="url(#sam_playstore-blue)"/><path d="M28 16 L72 35 L52 50 Z" fill="url(#sam_playstore-green)"/><path d="M28 84 L72 65 L52 50 Z" fill="url(#sam_playstore-red)"/><path d="M72 35 L83 50 L72 65 L52 50 Z" fill="url(#sam_playstore-yellow)"/></g></svg>`,
    svg: null,
  },
  sam_settings: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"> <defs> <linearGradient id="sam_settings-bg" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#252B3C"/><stop offset=".55" stop-color="#141826"/><stop offset="1" stop-color="#080A12"/> </linearGradient> <radialGradient id="sam_settings-hl" cx=".26" cy=".2" r=".62"> <stop offset="0" stop-color="#9DB2E0" stop-opacity=".3"/><stop offset="1" stop-color="#9DB2E0" stop-opacity="0"/> </radialGradient> <radialGradient id="sam_settings-sh" cx=".82" cy=".86" r=".6"> <stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/> </radialGradient> <linearGradient id="sam_settings-mtl" x1=".15" y1="0" x2=".9" y2="1"> <stop offset="0" stop-color="#F2F4F8"/><stop offset="1" stop-color="#CFD4DF"/> </linearGradient> <linearGradient id="sam_settings-hub" x1=".2" y1="0" x2=".85" y2="1"> <stop offset="0" stop-color="#C7CCD8"/><stop offset="1" stop-color="#A2A9B8"/> </linearGradient> <filter id="sam_settings-soft" x="-30%" y="-30%" width="160%" height="160%"> <feGaussianBlur stdDeviation="2.4"/></filter> </defs> <rect width="100" height="100" fill="url(#sam_settings-bg)"/> <rect width="100" height="100" fill="url(#sam_settings-hl)"/> <rect width="100" height="100" fill="url(#sam_settings-sh)"/> <g transform="translate(50 50)"> <g filter="url(#sam_settings-soft)" opacity=".55" fill="#000" transform="translate(1.6 2.2)"> <circle r="28.5"/> <g><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/> <g transform="rotate(30)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(60)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(90)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(120)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(150)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(180)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(210)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(240)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(270)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(300)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(330)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g></g> </g> <g fill="url(#sam_settings-mtl)"> <circle r="28.5"/> <rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/> <g transform="rotate(30)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(60)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(90)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(120)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(150)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(180)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(210)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(240)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(270)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(300)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> <g transform="rotate(330)"><rect x="-5.8" y="-35.6" width="11.6" height="11.5" rx="3.6"/></g> </g> <circle r="19.5" fill="url(#sam_settings-hub)"/> <g fill="#14182A"> <g transform="rotate(45)"><ellipse cx="0" cy="-9.6" rx="4.9" ry="4.9"/></g> <g transform="rotate(135)"><ellipse cx="0" cy="-9.6" rx="4.9" ry="4.9"/></g> <g transform="rotate(225)"><ellipse cx="0" cy="-9.6" rx="4.9" ry="4.9"/></g> <g transform="rotate(315)"><ellipse cx="0" cy="-9.6" rx="4.9" ry="4.9"/></g> </g> <circle r="4.4" fill="#8E96A8"/> </g> </svg>`,
    svg: null,
  },
  sam_smartthings: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="sam_smartthings-bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#2C9BFF"/>
  <stop offset="0.5" stop-color="#0A8AF5"/>
  <stop offset="1" stop-color="#0069D9"/>
</linearGradient>

<radialGradient id="sam_smartthings-hi" cx="0.26" cy="0.18" r="0.85">
  <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
  <stop offset="0.55" stop-color="#fff" stop-opacity="0.07"/>
  <stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<radialGradient id="sam_smartthings-sh" cx="0.82" cy="0.86" r="0.8">
  <stop offset="0" stop-color="#000" stop-opacity="0.17"/>
  <stop offset="0.6" stop-color="#000" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
<filter id="sam_smartthings-gs" x="-30%" y="-30%" width="170%" height="170%">
  <feDropShadow dx="0.9" dy="1.4" stdDeviation="1.5" flood-color="#000" flood-opacity="0.22"/>
</filter>
</defs>

<rect width="100" height="100" fill="url(#sam_smartthings-bg)"/>
<rect width="100" height="100" fill="url(#sam_smartthings-hi)"/><rect width="100" height="100" fill="url(#sam_smartthings-sh)"/><g transform="translate(50 50) scale(0.78) translate(-50 -50)">
<g filter="url(#sam_smartthings-gs)">
<line x1="50" y1="50" x2="50.00" y2="17.00" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
<line x1="50" y1="50" x2="81.38" y2="39.80" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
<line x1="50" y1="50" x2="69.40" y2="76.70" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
<line x1="50" y1="50" x2="30.60" y2="76.70" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
<line x1="50" y1="50" x2="18.62" y2="39.80" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
<circle cx="50" cy="50" r="17.5" fill="#fff"/>
<circle cx="50" cy="50" r="12.4" fill="url(#sam_smartthings-bg)"/>
<circle cx="50" cy="50" r="8.6" fill="#fff"/>
<circle cx="50.00" cy="17.00" r="14.5" fill="#fff"/><circle cx="50.00" cy="17.00" r="9.6" fill="url(#sam_smartthings-bg)"/><circle cx="50.00" cy="17.00" r="5.3" fill="#fff"/>
<circle cx="81.38" cy="39.80" r="14.5" fill="#fff"/><circle cx="81.38" cy="39.80" r="9.6" fill="url(#sam_smartthings-bg)"/><circle cx="81.38" cy="39.80" r="5.3" fill="#fff"/>
<circle cx="69.40" cy="76.70" r="14.5" fill="#fff"/><circle cx="69.40" cy="76.70" r="9.6" fill="url(#sam_smartthings-bg)"/><circle cx="69.40" cy="76.70" r="5.3" fill="#fff"/>
<circle cx="30.60" cy="76.70" r="14.5" fill="#fff"/><circle cx="30.60" cy="76.70" r="9.6" fill="url(#sam_smartthings-bg)"/><circle cx="30.60" cy="76.70" r="5.3" fill="#fff"/>
<circle cx="18.62" cy="39.80" r="14.5" fill="#fff"/><circle cx="18.62" cy="39.80" r="9.6" fill="url(#sam_smartthings-bg)"/><circle cx="18.62" cy="39.80" r="5.3" fill="#fff"/>
</g>
</g></svg>`,
    svg: null,
  },
  pix_calculator: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#7C8286"/><rect x="51" y="0" width="49" height="48" fill="#202124"/><rect x="0" y="48" width="51" height="52" fill="#5F6368"/><rect x="51" y="48" width="49" height="52" fill="#4285F4"/><g stroke="#FFFFFF" stroke-width="5.6" stroke-linecap="round"><path d="M19.5 25.5H36.5"/><path d="M68.5 19.5 81 32M81 19.5 68.5 32"/><path d="M18 74H35M26.5 65.5V82.5"/><path d="M66.5 69H82.5M66.5 79.5H82.5"/></g></svg>`,
    svg: null,
  },
  pix_calendar: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><defs><clipPath id="pix_calendar-c"><rect x="2" y="2" width="96" height="96" rx="10"/></clipPath></defs><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(50 50) scale(0.69) translate(-50 -50)"><g clip-path="url(#pix_calendar-c)"><rect x="2" y="2" width="96" height="96" fill="#4285F4"/><rect x="76.2" y="2" width="21.8" height="21" fill="#1967D2"/><rect x="76.2" y="23" width="21.8" height="53.2" fill="#FBBC04"/><rect x="2" y="76.2" width="96" height="21.8" fill="#34A853"/><rect x="2" y="76.2" width="21.4" height="21.8" fill="#188038"/><path d="M76.2 76.2H98V98Z" fill="#EA4335"/><rect x="23.4" y="23" width="52.8" height="53.2" fill="#FFFFFF"/><g fill="none" stroke="#4285F4" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"><path d="M35.4 40.6C37.4 36.2 47.6 35.6 48.8 42.8C49.6 47.9 45.1 50.6 42.1 50.6C45.1 50.6 50.2 52.7 49.6 58.7C48.9 65.9 37.4 65.7 35.1 60.3"/><path d="M57.2 41.6L63.8 36.4V64.9"/></g></g></g></svg>`,
    svg: null,
  },
  pix_camera: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#FFFFFF"/><g><path d="M38.5 22h23a3.5 3.5 0 0 1 3.2 2.1L67 29H79a6 6 0 0 1 6 6v37a6 6 0 0 1-6 6H21a6 6 0 0 1-6-6V35a6 6 0 0 1 6-6h12l2.3-4.9A3.5 3.5 0 0 1 38.5 22z" fill="#5F6368"/><path d="M15 46h70v26a6 6 0 0 1-6 6H21a6 6 0 0 1-6-6z" fill="#3C4043"/><circle cx="74" cy="36.5" r="2.4" fill="#DADCE0"/><circle cx="50" cy="50.5" r="14.2" fill="#FFFFFF"/><circle cx="50" cy="50.5" r="10.4" fill="#4285F4"/></g></svg>`,
    svg: null,
  },
  pix_chrome: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#FFFFFF"/><path d="M50.0,50.0 L20.56,33.00 A34.0,34.0 0 0,1 79.44,33.00 Z" fill="#EA4335"/><path d="M50.0,50.0 L79.44,33.00 A34.0,34.0 0 0,1 50.00,84.00 Z" fill="#FBBC04"/><path d="M50.0,50.0 L50.00,84.00 A34.0,34.0 0 0,1 20.56,33.00 Z" fill="#34A853"/><circle cx="50.0" cy="50.0" r="13.6" fill="#FFFFFF"/><circle cx="50.0" cy="50.0" r="10.4" fill="#4285F4"/></svg>`,
    svg: null,
  },
  pix_clock: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#DADCE0"/><circle cx="50" cy="50" r="43.5" fill="#5B8CEA"/><g stroke="#FFFFFF" stroke-linecap="round" fill="none"><path d="M50.5 51.5 32.5 27" stroke-width="3.4"/><path d="M50.5 51.5 21.5 80" stroke-width="3.4"/></g><circle cx="50.5" cy="51.5" r="4" fill="#FFFFFF"/></svg>`,
    svg: null,
  },
  pix_contacts: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(16.7 17.0) scale(0.13147)"><rect x="20" y="243" width="472" height="262" rx="131" fill="#93B0FF"/><rect x="62" y="243" width="388" height="262" rx="131" fill="#6B93FA"/><rect x="112" y="243" width="288" height="262" rx="96" fill="#0B57D0"/><circle cx="255" cy="105" r="103" fill="#0B57D0"/></g></svg>`,
    svg: null,
  },
  pix_drive: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><defs><clipPath id="pix_drive-ring"><path d="M45.94,10.04 Q50,2 54.06,10.04 L93.94,88.96 Q98,97 89,97 L11,97 Q2,97 6.06,88.96 Z M50,30 L69.2,68 L30.8,68 Z" clip-rule="evenodd"/></clipPath></defs><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(50 50) scale(0.73) translate(-50 -50)"><g clip-path="url(#pix_drive-ring)"><rect x="-3" y="-3" width="106" height="72" fill="#FFBA00"/><path d="M50,-3 L50,30 L30.8,68 L-3,68 L-3,-3 Z" fill="#00AC47"/><path d="M50,30 L33.34,-3 L50,-3 Z" fill="#0B8043"/><rect x="-3" y="68" width="106" height="35" fill="#2684FC"/><path d="M30.8,68 L14.6,103 L-3,103 L-3,68 Z" fill="#0066DA"/><path d="M69.2,68 L85.4,103 L103,103 L103,68 Z" fill="#EA4335"/></g></g></svg>`,
    svg: null,
  },
  pix_files: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(50 50) scale(0.75) translate(-50 -50)"><rect x="5" y="22" width="90" height="68" rx="10" fill="#4285F4"/><path d="M12 11 h42 v52 h-49 v-45 a7 7 0 0 1 7 -7 z" fill="#34A853"/><path d="M53 12 L13 63 L43 63 Z" fill="#FBBC04"/><path d="M53 12 L43 63 L59 63 Z" fill="#EA4335"/></g></svg>`,
    svg: null,
  },
  pix_gemini: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><defs><clipPath id="pix_gemini-star"><path d="M50,1 C54,26 74,46 99,50 C74,54 54,74 50,99 C46,74 26,54 1,50 C26,46 46,26 50,1 Z"/></clipPath><radialGradient id="pix_gemini-top" cx="50" cy="4" r="66" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F2495C"/><stop offset="0.45" stop-color="#EA4335" stop-opacity="0.8"/><stop offset="1" stop-color="#EA4335" stop-opacity="0"/></radialGradient><radialGradient id="pix_gemini-left" cx="1" cy="50" r="62" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F8D216"/><stop offset="0.4" stop-color="#FBBC04" stop-opacity="0.85"/><stop offset="1" stop-color="#FBBC04" stop-opacity="0"/></radialGradient><radialGradient id="pix_gemini-bot" cx="50" cy="99" r="62" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#25BE74"/><stop offset="0.4" stop-color="#34A853" stop-opacity="0.85"/><stop offset="1" stop-color="#34A853" stop-opacity="0"/></radialGradient><radialGradient id="pix_gemini-right" cx="99" cy="50" r="40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#A6C8FC"/><stop offset="0.5" stop-color="#7BAAF7" stop-opacity="0.7"/><stop offset="1" stop-color="#4285F4" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(50 50) scale(0.67) translate(-50 -50)"><g clip-path="url(#pix_gemini-star)"><rect width="100" height="100" fill="#1470E8"/><rect width="100" height="100" fill="url(#pix_gemini-top)"/><rect width="100" height="100" fill="url(#pix_gemini-left)"/><rect width="100" height="100" fill="url(#pix_gemini-bot)"/><rect width="100" height="100" fill="url(#pix_gemini-right)"/></g></g></svg>`,
    svg: null,
  },
  pix_keep: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(19 19)scale(0.62)"><path d="M10 0 H64 L100 25 V90 A10 10 0 0 1 90 100 H10 A10 10 0 0 1 0 90 V10 A10 10 0 0 1 10 0 Z" fill="#FBBC04"/><path d="M64 0 L100 25 L64 25 Z" fill="#F09300"/><ellipse cx="50" cy="45" rx="21" ry="15" fill="#FFFFFF"/><rect x="29" y="45" width="42" height="15" fill="#FFFFFF"/><rect x="38" y="66" width="24" height="8" fill="#FFFFFF"/></g></svg>`,
    svg: null,
  },
  pix_maps: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><defs><clipPath id="pix_maps-pin"><path d="M50 100C44 92 30 79 19 68C8 57 0 46 0 35C0 15.5 22 0 50 0C78 0 100 15.5 100 35C100 46 92 57 81 68C70 79 56 92 50 100Z"/></clipPath></defs><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(50 50) scale(0.68) translate(-50 -50)"><g clip-path="url(#pix_maps-pin)"><rect width="100" height="100" fill="#4285F4"/><polygon points="-10,-10 65,-10 -10,65" fill="#1A73E8"/><polygon points="-14,-16 30.3,28.3 -14,72.6" fill="#EA4335"/><polygon points="30.3,28.3 -14,72.6 -14,120 54,52" fill="#FBBC04"/><polygon points="4,102 102,4 112,4 112,112 4,112" fill="#34A853"/><ellipse cx="49.8" cy="34.7" rx="19.5" ry="13.2" fill="#FFFFFF"/></g></g></svg>`,
    svg: null,
  },
  pix_phone: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(50 50) scale(1.28) translate(-50 -50)"><g transform="translate(50 50) scale(2.5) translate(-12 -12)"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" fill="#1A73E8"/></g></g></svg>`,
    svg: null,
  },
  pix_playstore: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(16.96 16.83) scale(0.13008)"><path d="M8 22 C8 12 16 4 25 9 L248 255 L25 501 C16 506 8 498 8 488 Z" fill="#4285F4"/><path d="M25 9 L360 150 L248 255 Z" fill="#34A853"/><path d="M25 501 L360 360 L248 255 Z" fill="#EA4335"/><path d="M360 150 L466 203 C502 221 502 289 466 307 L360 360 L248 255 Z" fill="#FBBC04"/></g></svg>`,
    svg: null,
  },
  pix_settings: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#FFFFFF"/><g fill="#5F6368"><circle cx="50" cy="50" r="29"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(0 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(30 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(60 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(90 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(120 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(150 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(180 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(210 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(240 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(270 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(300 50 50)"/><rect x="45" y="12" width="10" height="15" rx="3.5" transform="rotate(330 50 50)"/></g><circle cx="50" cy="50" r="11.5" fill="#FFFFFF"/></svg>`,
    svg: null,
  },
  pix_wallet: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#FFFFFF"/><g transform="translate(50 50) scale(0.85) translate(-50 -50)"><rect x="14" y="15" width="72" height="55" rx="10" fill="#00A94F"/><rect x="12" y="24" width="76" height="46" rx="10" fill="#FFC800"/><rect x="10.5" y="33.5" width="79" height="37" rx="10" fill="#F94C43"/><path d="M10 45C24 51.5 40 57.5 55 57.5C67 57.5 80 52 90 45.5L90 72C90 77.5 86 82 80.5 82L19.5 82C14 82 10 77.5 10 72Z" fill="#4285F4"/></g></svg>`,
    svg: null,
  },
  pix_weather: {
    bg: "",
    full: true,
    raw: `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#5188E3"/><g fill="#FBC02D"><circle cx="42" cy="50" r="24"/><g><circle cx="42" cy="26" r="5.2"/><circle cx="54" cy="29.2" r="5.2"/><circle cx="62.8" cy="38" r="5.2"/><circle cx="66" cy="50" r="5.2"/><circle cx="62.8" cy="62" r="5.2"/><circle cx="54" cy="70.8" r="5.2"/><circle cx="42" cy="74" r="5.2"/><circle cx="30" cy="70.8" r="5.2"/><circle cx="21.2" cy="62" r="5.2"/><circle cx="18" cy="50" r="5.2"/><circle cx="21.2" cy="38" r="5.2"/><circle cx="30" cy="29.2" r="5.2"/></g></g><circle cx="42" cy="50" r="20" fill="#FFD75E"/><path d="M51 75.5C45.8 75.5 41.5 71.4 41.5 66.4C41.5 61.4 45.8 57.3 51 57.3C52.1 57.3 53.2 57.5 54.2 57.9C55.9 52.1 61.4 47.9 67.9 47.9C75.8 47.9 82.2 54.1 82.2 61.7C82.2 62.3 82.2 62.9 82.1 63.5C85.4 64.9 87.6 68 87.6 71.6C87.6 73.1 87.2 74.4 86.6 75.5Z" fill="#FFFFFF"/></svg>`,
    svg: null,
  },
};

/* ------------------------------------------------------------ elements */

/**
 * Which launcher is drawing. The same app is not the same artwork on every
 * platform — a Galaxy showing Apple's Phone icon is the loudest tell in a
 * mockup — so a tile resolves `<skin>_<art>` first and only falls back to the
 * shared key when a platform has no variant of its own.
 */
export const SkinCtx = createContext<Skin | undefined>(undefined);

function resolveArt(art: string, skin?: Skin) {
  return skin && APP_ART[`${skin}_${art}`] ? `${skin}_${art}` : art;
}

export function Tile({ art, name }: { art: string; name?: string }) {
  const skin = useContext(SkinCtx);
  const a = APP_ART[resolveArt(art, skin)];
  if (!a) return null;
  if (a.full && a.raw) {
    return (
      <span
        className="im-tile full"
        data-app={resolveArt(art, skin)}
        aria-label={name}
        /* Recreated artwork, authored as a complete <svg> string. */
        dangerouslySetInnerHTML={{ __html: a.raw }}
      />
    );
  }
  return (
    <span className="im-tile" data-app={resolveArt(art, skin)} style={{ background: a.bg }} aria-label={name}>
      <svg viewBox="0 0 24 24" aria-hidden>{a.svg}</svg>
    </span>
  );
}

/**
 * The very same Safari artwork the Home Screen draws. The stop screen points
 * at Safari, so the two surfaces must not disagree about what Safari looks
 * like — a hand-drawn second Safari is how a mockup contradicts itself.
 */
export function SafariArt() {
  const a = APP_ART.safari;
  if (!a?.raw) return null;
  return <span className="im-art" dangerouslySetInnerHTML={{ __html: a.raw }} />;
}

function App({ art, name }: { art: string; name: string }) {
  return (
    <span className="im-app dim">
      <Tile art={art} name={name} />
      <span className="im-nm">{name}</span>
    </span>
  );
}

/** Trackd's own icon — the real `public/icon-192.png`, not a redraw. */
export function TrackdApp({ landing }: { landing?: boolean }) {
  return (
    <span className={cn("im-app ours", landing && "landing")}>
      <span className="im-tile">
        <Image src="/icon-192.png" alt="" width={192} height={192} />
      </span>
      <span className="im-nm">Trackd</span>
    </span>
  );
}

export type Skin = "ios" | "sam" | "pix";

/**
 * A drawn home screen. `landing` plays the slam-in on Trackd's tile;
 * `withoutTrackd` holds its slot with another app, for the frames that come
 * BEFORE the install and must not give the ending away.
 */
export function HomeScreenMock(props: { skin: Skin; landing?: boolean; withoutTrackd?: boolean }) {
  return (
    <SkinCtx.Provider value={props.skin}>
      <HomeScreenBody {...props} />
    </SkinCtx.Provider>
  );
}

function HomeScreenBody({
  skin,
  landing,
  withoutTrackd,
}: {
  skin: Skin;
  landing?: boolean;
  withoutTrackd?: boolean;
}) {
  const ours = withoutTrackd ? <App art="files" name="Files" /> : <TrackdApp landing={landing} />;

  if (skin === "sam") {
    return (
      <div className="im-home sam">
        <div className="im-home-bg" />
        <div className="im-home-in">
          <div className="im-home-body">
            <div className="im-clock">
              <div className="t">9:41</div>
              <div className="d">Thursday, 27 August</div>
            </div>
            <div className="im-grid c4">
              <App art="phone" name="Phone" /><App art="messages" name="Messages" />
              <App art="internet" name="Internet" /><App art="camera" name="Camera" />
              <App art="gallery" name="Gallery" /><App art="health" name="Health" />
              <App art="playstore" name="Play Store" />{ours}
            </div>
          </div>
          <div>
            <div className="im-dots"><i /><i className="on" /><i /></div>
            <div className="im-dock">
              <Tile art="phone" /><Tile art="contacts" /><Tile art="messages" />
              <Tile art="internet" /><Tile art="camera" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (skin === "pix") {
    return (
      <div className="im-home pix">
        <div className="im-home-bg" />
        <div className="im-home-in">
          <div className="im-home-body">
            <div className="im-glance">
              <div className="d">Thu, 27 Aug</div>
              <div className="w">19° Sunny</div>
            </div>
            <div className="im-grid c5">
              <App art="messages" name="Messages" /><App art="chrome" name="Chrome" />
              <App art="gmail" name="Gmail" /><App art="photos" name="Photos" />
              <App art="youtube" name="YouTube" /><App art="camera" name="Camera" />
              <App art="maps" name="Maps" /><App art="gemini" name="Gemini" />
              <App art="settings" name="Settings" />{ours}
            </div>
          </div>
          <div>
            <div className="im-dots"><i className="on" /><i /></div>
            <div className="im-dock">
              <Tile art="phone" /><Tile art="messages" /><Tile art="chrome" />
              <Tile art="gemini" /><Tile art="camera" />
            </div>
            <div className="im-gbar"><span className="g">Search</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="im-home ios">
      <div className="im-home-bg" />
      <div className="im-home-in">
        <div className="im-home-body">
          <div className="im-grid c4">
            <App art="messages" name="Messages" /><App art="calendar" name="Calendar" />
            <App art="photos" name="Photos" /><App art="camera" name="Camera" />
            <App art="mail" name="Mail" /><App art="health" name="Health" />
            <App art="wallet" name="Wallet" />{ours}
          </div>
        </div>
        <div>
          <div className="im-dots"><i className="on" /><i /><i /></div>
          <div className="im-search im-lg"><span>Search</span></div>
          <div className="im-dock im-lg">
            <Tile art="phone" /><Tile art="safari" /><Tile art="messages" /><Tile art="music" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** iOS status bar, for a screen shown inside the installed app or Safari. */
export function IosStatusBar() {
  return (
    <>
      <div className="im-sb">
        <span>9:41</span>
        <span className="im-sb-r">
          <svg viewBox="0 0 20 14" width="17" height="12" aria-hidden>
            <rect x="0" y="9" width="3" height="5" rx="1" fill="currentColor" />
            <rect x="5" y="6.5" width="3" height="7.5" rx="1" fill="currentColor" />
            <rect x="10" y="4" width="3" height="10" rx="1" fill="currentColor" />
            <rect x="15" y="1.5" width="3" height="12.5" rx="1" fill="currentColor" />
          </svg>
          <svg viewBox="0 0 26 14" width="25" height="13" aria-hidden>
            <rect x="1" y="2" width="20" height="10" rx="3.2" stroke="currentColor" strokeWidth="1.1" opacity=".45" fill="none" />
            <rect x="2.8" y="3.8" width="15.5" height="6.4" rx="1.7" fill="currentColor" />
          </svg>
        </span>
      </div>
      <span className="im-island" />
    </>
  );
}
