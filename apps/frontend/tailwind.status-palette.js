// Status colours (emerald/amber/red/...) that adapt to the dark theme.
// Each entry: [light rgb channels, dark rgb channels]. Utilities are emitted as
// CSS variables by the plugin below and referenced from tailwind.config.js.
const bg = {
  emerald: { 50: ['236 253 245', '16 42 33'], 100: ['209 250 229', '20 56 43'] },
  amber: { 50: ['255 251 235', '44 36 16'], 100: ['254 243 199', '58 46 18'] },
  red: { 50: ['254 242 242', '46 22 22'], 100: ['254 226 226', '62 28 28'] },
  rose: { 50: ['255 241 242', '46 22 28'], 100: ['255 228 230', '62 28 36'] },
  blue: { 100: ['219 234 254', '24 40 62'] },
  purple: { 50: ['250 245 255', '36 24 52'], 100: ['243 232 255', '46 30 66'] },
  indigo: { 100: ['224 231 255', '30 34 70'] },
};
const border = {
  emerald: { 200: ['167 243 208', '28 80 62'], 300: ['110 231 183', '36 110 84'] },
  amber: { 200: ['253 230 138', '84 66 24'], 300: ['252 211 77', '128 96 28'] },
  red: { 200: ['254 202 202', '90 40 40'], 300: ['252 165 165', '110 48 48'] },
  rose: { 200: ['254 205 211', '90 40 52'] },
  blue: { 200: ['191 219 254', '40 64 100'] },
  purple: { 200: ['233 213 255', '70 48 100'] },
};
const text = {
  emerald: { 600: ['5 150 105', '52 211 153'], 700: ['4 120 87', '110 231 183'], 800: ['6 95 70', '167 243 208'], 900: ['6 78 59', '209 250 229'] },
  amber: { 600: ['217 119 6', '251 191 36'], 700: ['180 83 9', '252 211 77'], 800: ['146 64 14', '253 230 138'], 900: ['120 53 15', '254 243 199'] },
  red: { 600: ['220 38 38', '248 113 113'], 700: ['185 28 28', '252 165 165'], 800: ['153 27 27', '254 202 202'], 900: ['127 29 29', '254 202 202'] },
  rose: { 600: ['225 29 72', '251 113 133'], 700: ['190 18 60', '253 164 175'], 800: ['159 18 57', '254 205 211'] },
  blue: { 600: ['37 99 235', '96 165 250'], 700: ['29 78 216', '147 197 253'] },
  purple: { 700: ['126 34 206', '216 180 254'] },
  indigo: { 700: ['67 56 202', '165 180 252'] },
};
const groups = { bg, border, text };

const theme = { backgroundColor: {}, borderColor: {}, textColor: {} };
const keys = { bg: 'backgroundColor', border: 'borderColor', text: 'textColor' };
const light = {};
const dark = {};
for (const [kind, palette] of Object.entries(groups)) {
  for (const [color, shades] of Object.entries(palette)) {
    theme[keys[kind]][color] = {};
    for (const [shade, [l, d]] of Object.entries(shades)) {
      const name = `--status-${kind}-${color}-${shade}`;
      light[name] = l;
      dark[name] = d;
      theme[keys[kind]][color][shade] = `rgb(var(${name}) / <alpha-value>)`;
    }
  }
}

export const statusTheme = theme;
export const statusVariables = ({ addBase }) => addBase({ ':root': light, '.dark': dark });
