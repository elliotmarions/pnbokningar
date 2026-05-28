// iOS standalone-PWA startup images ("splash screens"). Without these, iOS
// shows a white screen in the gap between tapping the home-screen icon and the
// web view loading. Each device resolution needs its own image + media query.
// Rendered in the root layout; React hoists <link> tags into <head>.

const SPLASHES: { w: number; h: number; dw: number; dh: number; r: number }[] = [
  { w: 1290, h: 2796, dw: 430, dh: 932, r: 3 }, // 15 Pro Max / 15 Plus / 14 Pro Max
  { w: 1320, h: 2868, dw: 440, dh: 956, r: 3 }, // 16 Pro Max
  { w: 1206, h: 2622, dw: 402, dh: 874, r: 3 }, // 16 Pro
  { w: 1179, h: 2556, dw: 393, dh: 852, r: 3 }, // 15 / 15 Pro / 14 Pro
  { w: 1284, h: 2778, dw: 428, dh: 926, r: 3 }, // 14 Plus / 13 Pro Max / 12 Pro Max
  { w: 1170, h: 2532, dw: 390, dh: 844, r: 3 }, // 14 / 13 / 13 Pro / 12 / 12 Pro
  { w: 1125, h: 2436, dw: 375, dh: 812, r: 3 }, // 13 mini / 12 mini / 11 Pro / XS / X
  { w: 1242, h: 2688, dw: 414, dh: 896, r: 3 }, // 11 Pro Max / XS Max
  { w: 828,  h: 1792, dw: 414, dh: 896, r: 2 }, // 11 / XR
  { w: 1242, h: 2208, dw: 414, dh: 736, r: 3 }, // 8 Plus / 7 Plus / 6s Plus
  { w: 750,  h: 1334, dw: 375, dh: 667, r: 2 }, // SE2/SE3 / 8 / 7 / 6s
  { w: 640,  h: 1136, dw: 320, dh: 568, r: 2 }, // SE 1st gen
]

export function IosSplashLinks() {
  return (
    <>
      {SPLASHES.map(({ w, h, dw, dh, r }) => (
        <link
          key={`${w}x${h}`}
          rel="apple-touch-startup-image"
          href={`/splash/apple-splash-${w}-${h}.png`}
          media={`(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`}
        />
      ))}
    </>
  )
}
