export const answers = {
  forces: 'The downhill component mg sin θ increases. The perpendicular component mg cos θ decreases.',
  lens: 'They appear to meet on the object side in a virtual, upright image.',
  circuit: 'The new current is V/(R₁ + 2R₂); it is smaller, but not necessarily half the original current.',
  interference: 'The fringe spacing decreases: in the small-angle limit it is approximately Lλ/d.',
  carnot: 'It represents the net work done by the system over one cycle, ∮ P dV.',
  bandgap: 'A typical insulator has a larger gap. Ordinary photons or thermal energy are less likely to bridge it.',
  phase: 'Without damping the nonzero-energy orbits close instead of spiralling inward.',
  bloch: 'All states on the equator have equal amplitudes; the azimuth determines relative phase.',
  lattice: 'G fixes the plane normal, and the perpendicular spacing is 2π divided by its magnitude.',
  water: 'Linear CO₂ has opposing equal bond dipoles that cancel.',
  bonding: 'Opposite charges attract. The stable crystal balances these attractions against short-range repulsion.',
  titration: 'A weak acid titrated with strong base has a basic equivalence point because its conjugate base reacts with water.',
  sn2: 'Crowding hinders the nucleophile from approaching the carbon on the side opposite the leaving group.',
  mo: 'One bonding electron and zero antibonding electrons give bond order ½.',
  chromatography: 'Peak B elutes later and is retained longer under the same conditions.',
  'field-split': 'If Δₒ exceeds the effective pairing cost, d⁶ favours a low-spin t₂g⁶ arrangement.',
  jablonski: 'The triplet-to-singlet radiative transition is spin-forbidden in the simple model, so decay is usually slower.',
  'energy-surface': 'A catalyst provides a pathway with a lower activation free energy without changing the endpoint states.',
  'plant-cell': 'The central vacuole loses water and shrinks. The wall retains its basic shape.',
  heart: 'The left ventricle supplies systemic circulation and generates the higher pressure needed for that circuit.',
  leaf: 'Lower stomatal conductance reduces transpiration but also restricts carbon dioxide uptake.',
  meiosis: 'Meiosis I reduces ploidy by separating homologs. Meiosis II separates the sisters.',
  'action-potential': 'Many Na⁺ channels are temporarily inactivated; persistent K⁺ conductance also makes threshold harder to reach.',
  enzyme: 'No. In the simple model Km = (k₋₁ + kcat)/k₁; it approaches the dissociation constant only when kcat is small compared with k₋₁.',
  linkage: 'Multiple crossovers can restore a parental marker configuration. At long separation the marker combinations approach independent assortment.',
  chemiosmosis: 'Dissipating the gradient reduces ATP synthesis even if respiration continues or increases.',
  phylogeny: 'B and C remain sisters. Rotation changes the drawing, not the common ancestor.',
  slope: 'The slope is unchanged because the ratio stays the same.',
  'unit-circle': 'Sine is positive (y > 0), while cosine is negative (x < 0).',
  quadratic: 'The vertex is (3, 1); the positive coefficient opens the parabola upward.',
  derivative: 'The one-sided slopes at zero are −1 and +1, so there is no common limit.',
  riemann: 'A refinement raises the left sum toward the area for an increasing function.',
  normal: 'The z-score is −1.',
  eigenvectors: 'Any nonzero vector in that eigenspace reverses direction when multiplied by a negative eigenvalue.',
  lagrange: 'If ∇g = 0 the regularity condition fails. The usual gradient relation may miss such candidates.',
  fourier: 'The oscillation narrows near the jump, but the limiting overshoot remains about 9% of the jump (Gibbs phenomenon).',
};
export const chapterFor = ({ subject, id }) => ({
  Physics: { forces:'Mechanics', lens:'Optics', circuit:'Circuits', interference:'Optics', carnot:'Thermodynamics', bandgap:'Solid state',phase:'Dynamics',bloch:'Quantum mechanics',lattice:'Solid state' },
  Chemistry: { water:'Bonding',bonding:'Bonding',titration:'Equilibria',sn2:'Organic chemistry',mo:'Bonding',chromatography:'Analytical chemistry','field-split':'Coordination chemistry',jablonski:'Spectroscopy','energy-surface':'Kinetics' },
  Biology: { 'plant-cell':'Cell biology',heart:'Physiology',leaf:'Plant biology',meiosis:'Genetics','action-potential':'Physiology',enzyme:'Biochemistry',linkage:'Genetics',chemiosmosis:'Biochemistry',phylogeny:'Evolution' },
  Mathematics: { slope:'Algebra','unit-circle':'Trigonometry',quadratic:'Algebra',derivative:'Calculus',riemann:'Calculus',normal:'Statistics',eigenvectors:'Linear algebra',lagrange:'Optimisation',fourier:'Analysis' },
}[subject]?.[id] || 'Foundations');

export function circuitCurrent(volts, r1, r2) {
  if (![volts, r1, r2].every(Number.isFinite) || r1 <= 0 || r2 <= 0) throw Error('Use finite numbers and positive resistors');
  return { current: volts / (r1 + r2), drop1: volts * r1 / (r1 + r2), drop2: volts * r2 / (r1 + r2) };
}
export function thinLens(focalLength, distance) {
  if (!Number.isFinite(focalLength) || !Number.isFinite(distance) || focalLength <= 0 || distance <= 0) throw Error('Use positive distances');
  if (focalLength === distance) return { image: Infinity, magnification: null };
  const image = focalLength * distance / (distance - focalLength);
  return { image, magnification: -image / distance };
}
