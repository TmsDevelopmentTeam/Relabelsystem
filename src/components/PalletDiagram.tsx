'use client';

// Réplica de la "Figura 1. Ordenado de placas de inventario de Monitor Dell".
// Dibujo de líneas negras sobre blanco (estilo CAD del cliente). 4 camas x 18 = 72.
// Ilumina en verde la position escaneada. Numeración idéntica al diagrama.
type Props = { position?: number | null };
type Pt = [number, number];

const bil = (P00: Pt, P10: Pt, P11: Pt, P01: Pt, u: number, v: number): Pt => [
  (1 - u) * (1 - v) * P00[0] + u * (1 - v) * P10[0] + u * v * P11[0] + (1 - u) * v * P01[0],
  (1 - u) * (1 - v) * P00[1] + u * (1 - v) * P10[1] + u * v * P11[1] + (1 - u) * v * P01[1],
];
const poly = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

export default function PalletDiagram({ position }: Props) {
  const pos = position != null && !isNaN(Number(position)) ? Number(position) : null;
  const perCama = 18, camas = 4;
  const camaDe = pos != null ? Math.ceil(pos / perCama) : null;

  // Caja isométrica (fondo largo, como el original)
  const FBL: Pt = [120, 470], FBR: Pt = [470, 470], FTR: Pt = [470, 180], FTL: Pt = [120, 180];
  const Dv: Pt = [320, -150];
  const BBL: Pt = [FBL[0] + Dv[0], FBL[1] + Dv[1]], BBR: Pt = [FBR[0] + Dv[0], FBR[1] + Dv[1]];
  const BTR: Pt = [FTR[0] + Dv[0], FTR[1] + Dv[1]], BTL: Pt = [FTL[0] + Dv[0], FTL[1] + Dv[1]];

  const front = (u: number, v: number) => bil(FBL, FBR, FTR, FTL, u, v);
  const right = (u: number, v: number) => bil(FBR, BBR, BTR, FTR, u, v);
  const top = (u: number, v: number) => bil(FTL, FTR, BTR, BTL, u, v);

  const pad = 0.04;
  const cell = (f: (u: number, v: number) => Pt, u0: number, u1: number, v0: number, v1: number) => {
    const p: Pt[] = [f(u0 + pad / 8, v0 + pad / 4), f(u1 - pad / 8, v0 + pad / 4), f(u1 - pad / 8, v1 - pad / 4), f(u0 + pad / 8, v1 - pad / 4)];
    return { pts: p, c: f((u0 + u1) / 2, (v0 + v1) / 2) };
  };
  const band = (k: number): [number, number] => [(k - 1) / camas, k / camas];

  type Plate = { pos: number; pts: Pt[]; c: Pt };
  const plates: Plate[] = [];
  const dell: Pt[] = [];

  // FRENTE: numeros por cama y columna (0..7 izq->der)
  const frontMap: Record<number, Array<[number, number]>> = {
    1: [[1, 7], [2, 6], [3, 5], [4, 4]],
    2: [[19, 3], [20, 2], [21, 1], [22, 0]],
    3: [[37, 7], [38, 6], [39, 5], [40, 4]],
    4: [[55, 3], [56, 2], [57, 1], [58, 0]],
  };
  const frontDell: Record<number, number> = { 1: 1.5, 2: 5.5, 3: 1.5, 4: 5.5 };
  for (let k = 1; k <= camas; k++) {
    const [v0, v1] = band(k);
    for (const [p, col] of frontMap[k]) {
      const r = cell(front, col / 8, (col + 1) / 8, v0, v1);
      plates.push({ pos: p, pts: r.pts, c: r.c });
    }
    dell.push(front(frontDell[k] / 8, (v0 + v1) / 2));
  }

  // DERECHA: 5 placas por cama en profundidad (0=frente)
  const rightMap: Record<number, number[]> = {
    1: [14, 15, 16, 17, 18],
    2: [36, 35, 34, 33, 32],
    3: [54, 53, 52, 51, 50],
    4: [72, 71, 70, 69, 68],
  };
  for (let k = 1; k <= camas; k++) {
    const [v0, v1] = band(k);
    rightMap[k].forEach((p, d) => {
      const r = cell(right, d / 5, (d + 1) / 5, v0, v1);
      plates.push({ pos: p, pts: r.pts, c: r.c });
    });
  }

  // ARRIBA (cama 4): 59..67 en grid 3(ancho) x 3(fondo)
  const topOrder = [59, 60, 61, 62, 63, 64, 65, 66, 67];
  topOrder.forEach((p, i) => {
    const cc = i % 3, rr = Math.floor(i / 3);
    const r = cell(top, cc / 3, (cc + 1) / 3, rr / 3, (rr + 1) / 3);
    plates.push({ pos: p, pts: r.pts, c: r.c });
  });

  const visible = new Set(plates.map((p) => p.pos));
  const interior = pos != null && !visible.has(pos);

  const W = 860, H = 560;
  const arrowY = (FBR[1] + FTR[1]) / 2;

  const DellLogo = ({ p, i }: { p: Pt; i: number }) => (
    <g key={`d${i}`}>
      <ellipse cx={p[0]} cy={p[1]} rx="19" ry="19" fill="#111" />
      <text x={p[0]} y={p[1] + 4} textAnchor="middle" fontSize="9" fill="#fff" fontStyle="italic" fontWeight="bold">DELL</text>
    </g>
  );

  return (
    <div className="rounded-xl bg-white border-2 border-slate-300 p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide text-slate-600 font-bold">Figura 1 · Ordenado de placas — Monitor Dell</div>
        {pos != null && <div className="text-sm font-black text-emerald-700">#{pos} · Cama {camaDe}</div>}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 460 }}>
        <rect width={W} height={H} fill="#ffffff" />
        <text x="20" y="26" fontSize="13" fill="#333" fontStyle="italic">Figura 1. Ordenado de placas de inventario de Monitor Dell</text>
        <text x="30" y={(FBL[1] + FTL[1]) / 2} fontSize="14" fill="#333" textAnchor="end" transform={`translate(60,0)`}>Frontal</text>

        {/* Caras de la caja */}
        <polygon points={poly([FTL, FTR, BTR, BTL])} fill="#fafafa" stroke="#111" strokeWidth="1.5" />
        <polygon points={poly([FBR, BBR, BTR, FTR])} fill="#f4f4f4" stroke="#111" strokeWidth="1.5" />
        <polygon points={poly([FBL, FBR, FTR, FTL])} fill="#ffffff" stroke="#111" strokeWidth="1.5" />

        {/* divisorias de camas (frente y derecha) */}
        {[1, 2, 3].map((k) => (
          <g key={`div${k}`}>
            <line x1={front(0, k / 4)[0]} y1={front(0, k / 4)[1]} x2={front(1, k / 4)[0]} y2={front(1, k / 4)[1]} stroke="#111" strokeWidth="1" />
            <line x1={right(0, k / 4)[0]} y1={right(0, k / 4)[1]} x2={right(1, k / 4)[0]} y2={right(1, k / 4)[1]} stroke="#111" strokeWidth="1" />
          </g>
        ))}

        {/* resaltar cama si interior */}
        {interior && camaDe != null && (
          <polygon
            points={poly([front(0, (camaDe - 1) / 4), front(1, (camaDe - 1) / 4), front(1, camaDe / 4), front(0, camaDe / 4)])}
            fill="#22c55e" opacity="0.30" stroke="#16a34a" strokeWidth="2.5"
          />
        )}

        {/* placas numeradas */}
        {plates.map((p) => {
          const hi = pos === p.pos;
          return (
            <g key={p.pos}>
              <polygon points={poly(p.pts)} fill={hi ? '#22c55e' : 'transparent'} stroke={hi ? '#15803d' : '#333'} strokeWidth={hi ? 3 : 0.7} />
              <text x={p.c[0]} y={p.c[1] + 4} textAnchor="middle" fontSize={hi ? 16 : 11} fontWeight={hi ? 'bold' : 'normal'} fill={hi ? '#052e16' : '#222'}>{p.pos}</text>
            </g>
          );
        })}

        {/* logos Dell */}
        {dell.map((p, i) => <DellLogo key={i} p={p} i={i} />)}

        {/* flecha frontal (derecha) */}
        <line x1={BBR[0] + 20} y1={arrowY} x2={BBR[0] + 70} y2={arrowY} stroke="#3b82f6" strokeWidth="8" />
        <polygon points={`${BBR[0] + 18},${arrowY - 12} ${BBR[0] - 2},${arrowY} ${BBR[0] + 18},${arrowY + 12}`} fill="#3b82f6" />

        <text x="20" y={H - 12} fontSize="11" fill="#666" fontStyle="italic">Nota. La imagen de logotipo es propiedad de Dell.</text>
      </svg>
      {interior && pos != null && (
        <div className="text-[12px] text-emerald-700 mt-1 font-bold">
          La posición #{pos} va al INTERIOR de la Cama {camaDe} (no queda a la vista). Cama resaltada en verde.
        </div>
      )}
    </div>
  );
}
