import { circuitCurrent, thinLens } from '../lab-practice.js';
import { el } from '../utils.js';

export function experiment(id) {
  if (!['circuit','lens'].includes(id)) return null;
  const box = el('section', { class: 'lab-experiment' }, el('h4', { text: id === 'circuit' ? 'Try it · Series circuit' : 'Try it · Thin lens' }));
  const figure = el('div', { class: 'lab-sim-plot' });
  const result = el('p', { role: 'status' });
  function slider(name, min, max, value, unit) {
    const input = el('input', { type: 'range', min, max, value, 'aria-label': name });
    const valueLabel = el('output', { text: `${value} ${unit}` });
    box.append(el('label', { class: 'lab-slider' }, el('span', { text: name }), input, valueLabel));
    input.oninput = () => { valueLabel.textContent = `${input.value} ${unit}`; refresh(); };
    return input;
  }
  let volts,r1,r2,f,d;
  if (id === 'circuit') {
    volts = slider('Battery voltage',1,24,12,'V'); r1 = slider('Resistance R₁',10,100,20,'Ω'); r2 = slider('Resistance R₂',10,100,40,'Ω');
  } else { f = slider('Focal length',12,40,20,'cm'); d = slider('Object distance',8,90,43,'cm'); }
  box.append(figure, result); refresh(); return box;
  function refresh() {
    if (id === 'circuit') {
      const {current,drop1,drop2} = circuitCurrent(+volts.value,+r1.value,+r2.value);
      result.textContent = `I = ${(current*1000).toFixed(0)} mA · R₁ drop ${drop1.toFixed(1)} V · R₂ drop ${drop2.toFixed(1)} V`;
      const width = Math.max(2,current * 165);
      figure.innerHTML = `<svg viewBox="0 0 660 135" role="img" aria-label="Colour bars comparing voltage drops"><rect width="660" height="135" fill="#ecf4fc"/><rect x="55" y="38" width="${550*drop1/(drop1+drop2)}" height="28" fill="#2374bd"/><rect x="${55+550*drop1/(drop1+drop2)}" y="38" width="${550*drop2/(drop1+drop2)}" height="28" fill="#178471"/><text x="55" y="31" fill="#254574">Voltage split: R₁ then R₂</text><path d="M56 102h${Math.min(550,width*2.5)}" stroke="#b13169" stroke-width="8"/><text x="375" y="106" fill="#254574">Current magnitude</text></svg>`;
    } else {
      const dobs = +d.value, focal = +f.value;
      const { image, magnification } = thinLens(focal,dobs);
      result.textContent = !Number.isFinite(image) ? 'Parallel emergent rays: no finite image at the focal distance.' : `Image distance ${image.toFixed(1)} cm · magnification ${magnification.toFixed(2)}× · ${image > 0 ? 'real, inverted' : 'virtual, upright'}`;
      const x = 330 - dobs * 3, fx = focal * 3, y = 118, top = y - 29;
      const ix = 330 + image*3, iy = y-29*magnification;
      const rayY = top + 29 * 295/fx, centreY = y+29 * 295/(330-x);
      figure.innerHTML = `<svg viewBox="0 0 660 236" role="img" aria-label="Ray diagram for a converging thin lens"><rect width="660" height="236" fill="#ecf4fc"/><path d="M35 ${y}h590M330 20v191" stroke="#637993" stroke-width="2"/><path d="M${x} ${y}V${top}l-5 8m5-8 5 8" stroke="#087c70" stroke-width="4" fill="none"/><path d="M${x} ${top}H330L625 ${rayY}M${x} ${top} 330 ${y} 625 ${centreY}" stroke="#bd6823" stroke-width="2" fill="none"/>${Number.isFinite(image) && ix>25 && ix<635 && iy>12 && iy<222 ? `<path d="M${ix} ${y}V${iy}" stroke="#a83870" stroke-width="5" ${image < 0 ? 'stroke-dasharray="5 4"' : ''}/>` : ''}<circle cx="${330-fx}" cy="${y}" r="4" fill="#2165c4"/><circle cx="${330+fx}" cy="${y}" r="4" fill="#2165c4"/><text x="320" y="226" fill="#254574">Lens</text></svg>`;
    }
  }
}
