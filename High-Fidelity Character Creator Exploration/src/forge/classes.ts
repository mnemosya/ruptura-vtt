import raw from './classes.json'
import ancora from '../imports/ancora.png'
import cacador from '../imports/cacador.jpg'
import combatente from '../imports/combatente.png'
import face from '../imports/face_2.png'
import infiltrador from '../imports/infiltrador.png'
import tecnico from '../imports/tecnico.png'
import vanguarda from '../imports/vanguarda.png'

export type Feat = { n: string; d: string }
export type Rank = { r: string; lead: string; feats: Feat[] }
export type ClassDoc = {
  role: string; sec: string; intro: string[]; skills3: string[]
  syn: { v: string; d: string; n: number }[]
  feats: Rank[]
  subs: { n: string; tag: string; lore: string; ranks: Rank[] }[]
}

/* extraído dos documentos de classe em src/imports */
export const CLASS_DOCS = raw as Record<string, ClassDoc>

export const CLASS_ART: Record<string, string> = {
  'Âncora': ancora, 'Caçador': cacador, 'Combatente': combatente, 'Face': face,
  'Infiltrador': infiltrador, 'Técnico': tecnico, 'Vanguarda': vanguarda,
}

export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S']
