export const U = (id: string, w = 800, h = 1000) =>
  `https://images.unsplash.com/${id.startsWith('flagged') ? id : 'photo-' + id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`

export const DEFAULT_AVATAR = U('1660514163811-cc993ac5ff1f', 700, 900)

export * from './regions'

export const CLASSES = [
  { id: 'Âncora', code: 'ANC', img: '1598776460172-9d6cf1df1d57', role: 'Sustentação', line: 'Mantém o grupo de pé quando a realidade dobra.' },
  { id: 'Caçador', code: 'CAÇ', img: '1646703138033-f1b529c4ed07', role: 'Preparação', line: 'Segue o rastro, escolhe o terreno, fecha o cerco.' },
  { id: 'Combatente', code: 'CMB', img: '1568651123200-f461f7588f1c', role: 'Eliminação', line: 'Disciplina física aplicada no ponto de ruptura.' },
  { id: 'Face', code: 'FAC', img: '1580046939256-c377c5b099f1', role: 'Influência', line: 'Abre portas que nenhuma arma abriria.' },
  { id: 'Infiltrador', code: 'INF', img: '1700774606348-9249ec7fc882', role: 'Infiltração', line: 'Entra onde não deveria. Sai antes do alarme.' },
  { id: 'Técnico', code: 'TEC', img: '1659141632957-a2cd74b8a446', role: 'Engenharia', line: 'Conserta, adapta e sobrecarrega máquinas.' },
  { id: 'Vanguarda', code: 'VNG', img: 'flagged/photo-1560177776-55a762c5c000', role: 'Linha de frente', line: 'Primeiro a entrar, último a recuar.' },
]

export const VERTENTES = [
  { id: 'Biótica', c: '#5dffa0', img: '1762281532443-3206b6116ead', g: 'Carne, sangue e crescimento. Molda o que está vivo.', spells: ['Sutura Viva', 'Pulso Vital', 'Enxerto'] },
  { id: 'Cinética', c: '#ffc02e', img: '1771947887649-4e6a0ea11652', g: 'Movimento, impulso e inércia sob o seu comando.', spells: ['Empuxo', 'Passo Curto', 'Barreira Vetorial'] },
  { id: 'Cognitiva', c: '#b48cff', img: '1766340002961-1b7dabdd3740', g: 'Percepção, memória e a arquitetura do pensamento.', spells: ['Eco Mental', 'Véu', 'Leitura Fria'] },
  { id: 'Energética', c: '#ff5a2a', img: '1762281532055-85a5d55de8f9', g: 'Calor, luz e descarga. A face mais visível da ruptura.', spells: ['Arco', 'Lampejo', 'Sobrecarga'] },
  { id: 'Material', c: '#f5d08a', img: '1762281532004-e020c9877f76', g: 'Matéria inerte que responde, dobra e se reforma.', spells: ['Moldar Liga', 'Fissura', 'Blindagem'] },
  { id: 'Sináptica', c: '#ff4fa8', img: '1761075666032-7540b8c58de7', g: 'Conexões entre mentes, máquinas e redes.', spells: ['Elo', 'Interferência', 'Ponte Neural'] },
]

export * from './traits'
export * from './classes'

export const STEPS = [
  { key: 'conceito', label: 'Conceito', group: 'CONCEITO' },
  { key: 'regiao', label: 'Região', group: 'TRAJETÓRIA' },
  { key: 'antecedente', label: 'Antecedente', group: 'TRAJETÓRIA' },
  { key: 'tracos', label: 'Traços', group: 'TRAJETÓRIA' },
  { key: 'classe', label: 'Classe', group: 'CLASSE' },
  { key: 'atributos', label: 'Atributos', group: 'MECÂNICA' },
  { key: 'vertente', label: 'Vertente', group: 'MECÂNICA' },
  { key: 'revisao', label: 'Revisão', group: 'SELAGEM' },
] as const

export type Build = {
  avatar: string; name: string; codename: string; concept: string; look: string
  region: string; town: string; bg: string; origin: string; q: Record<string, number>; c: Record<string, number>
  cls: string; attr: number[]; vert: string; spells: string[]
}

