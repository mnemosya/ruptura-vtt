import book from '../../../content/v12/db_classe_cacador_v1_2.json';

const profiles = [
  { id: 'canideo', name: 'Canídeo', heading: 'CANÍDEO', role: 'Rastrear e perseguir' },
  { id: 'felino', name: 'Felino', heading: 'FELINO', role: 'Emboscar e recuar' },
  { id: 'ave', name: 'Ave de rapina', heading: 'AVE DE RAPINA', role: 'Observar e assinalar' },
  { id: 'constritor', name: 'Constritora', heading: 'CONSTRITORA', role: 'Agarrar e conter' },
  { id: 'peconhento', name: 'Peçonhenta', heading: 'PEÇONHENTA', role: 'Inocular e debilitar' },
];
export type CompanionAction = { name: string; cost: number; description: string; attack: boolean };
export type HuntingModel = typeof profiles[number] & { hp: number; size: string; movement: string; attributes: number[]; skills: { name: string; level: number }[]; trait: string; instinct: string; actions: CompanionAction[] };
const subclass = book.subclasses.find(s => s.slug === 'domador')!;
const rankC = (rank: string) => ['C', 'B', 'A', 'S', 'S+'].includes(rank);
const modelCache = new Map<boolean, HuntingModel[]>();
export function huntingModels(rank: string): HuntingModel[] {
  const cached = modelCache.get(rankC(rank)); if (cached) return cached;
  const source = rankC(rank) ? subclass.caracteristicas.C[0].descricao : subclass.caracteristicas.E.find(f => f.slug === 'companheiros_de_caca')!.descricao;
  const models = profiles.map(profile => {
    const start = source.indexOf(`\n\n${profile.heading}\n\n- Tamanho:`);
    const tail = source.slice(start + profile.heading.length + 4);
    const end = tail.search(/\n\n[A-ZÁÉÍÓÚÇÃÕ ]{4,}\n\n/);
    const body = end < 0 ? tail : tail.slice(0, end);
    const actionStart = body.search(/\n\n\d PA /);
    const instinctStart = body.indexOf('\n\nInstinto.');
    const actionText = body.slice(actionStart, instinctStart);
    const matches = [...actionText.matchAll(/(\d) PA ([^.]+)\. /g)];
    return { ...profile,
      hp: Number(body.match(/- PV: (\d+)/)![1]),
      size: body.match(/- Tamanho: (.+)/)![1], movement: body.match(/- Deslocamento: (.+)/)![1],
      attributes: body.match(/Corpo (\d+) Mente (\d+) Ânimo (\d+)/)!.slice(1).map(Number),
      skills: [...body.match(/- Perícias: (.+)/)![1].matchAll(/([A-ZÁÉÍÓÚ][a-záéíóúâêôãõç]+) (\d+)/g)].map(m => ({ name: m[1], level: Number(m[2]) })),
      trait: body.slice(body.indexOf('\n\n') + 2, actionStart).trim(),
      instinct: body.slice(instinctStart + 11).trim(),
      actions: matches.map((m, i) => ({ name: m[2].replace(' (Ataque natural)', ''), cost: Number(m[1]), attack: m[2].includes('Ataque natural') || m[2] === 'Bote', description: actionText.slice(m.index! + m[0].length, matches[i + 1]?.index).trim() })),
    };
  });
  modelCache.set(rankC(rank), models); return models;
}
export type HuntingCompanion = { model: string; name: string; appearance: string; hp: number; conditions: string[]; reaction: boolean; commanded: boolean; pa: number; attacked: boolean; freeInoculationUsed?: boolean; round: number; scene: number };
export type CompanionCommand =
  | { type: 'companion'; operation: 'retire'; reason: 'Dispensado' | 'Morto' }
  | { type: 'companion'; operation: 'create'; model: string; name: string }
  | { type: 'companion'; operation: 'identity'; name: string; appearance: string }
  | { type: 'companion'; operation: 'hp' | 'pa'; value: number }
  | { type: 'companion'; operation: 'condition'; condition: string }
  | { type: 'companion'; operation: 'reaction' | 'attack' | 'turn' }
  | { type: 'companion'; operation: 'command'; reserve: boolean }
  | { type: 'companion'; operation: 'action'; name: string };
export function normalizeCompanion(value: HuntingCompanion | undefined, rank: string, scene: number, round: number): HuntingCompanion | undefined {
  if (!value || !huntingModels(rank).some(m => m.id === value.model)) return undefined;
  const model = huntingModels(rank).find(m => m.id === value.model)!;
  const next = { ...value, hp: Math.max(0, Math.min(model.hp, value.hp)), conditions: [...value.conditions] };
  if (value.round !== round || value.scene !== scene) Object.assign(next, { scene, round, commanded: false, pa: 1, attacked: false, freeInoculationUsed: false, reaction: true });
  return next;
}
export function companionChange(value: HuntingCompanion | undefined, cmd: CompanionCommand, rank: string, scene: number, round: number, reserve: number, availablePa: number): { companion?: HuntingCompanion; spent: number; reserveSpent: number; error?: string } {
  const fail = (error: string) => ({ companion: value, spent: 0, reserveSpent: 0, error });
  if (cmd.operation === 'create') {
    if (value) return fail('Um companheiro já está vinculado.');
    const model = huntingModels(rank).find(m => m.id === cmd.model);
    if (!model || !cmd.name.trim()) return fail('Escolha um perfil e dê um nome ao companheiro.');
    return { companion: { model: model.id, name: cmd.name.trim(), appearance: '', hp: model.hp, conditions: [], reaction: true, commanded: false, pa: 1, attacked: false, scene, round }, spent: 0, reserveSpent: 0 };
  }
  if (!value) return fail('Vincule um companheiro primeiro.');
  if (cmd.operation === 'retire') return { companion: undefined, spent: 0, reserveSpent: 0 };
  const c = structuredClone(value); const model = huntingModels(rank).find(m => m.id === c.model)!;
  let spent = 0, reserveSpent = 0;
  switch (cmd.operation) {
    case 'identity': if (!cmd.name.trim()) return fail('Informe um nome.'); c.name = cmd.name.trim(); c.appearance = cmd.appearance; break;
    case 'hp': if (!Number.isInteger(cmd.value) || cmd.value < 0 || cmd.value > model.hp) return fail('PV fora do limite.'); c.hp = cmd.value; break;
    case 'pa': if (!Number.isInteger(cmd.value) || cmd.value < 0 || cmd.value > 2) return fail('PA fora do limite.'); c.pa = cmd.value; break;
    case 'condition': if (!cmd.condition.trim()) return fail('Escolha uma condição.'); c.conditions = c.conditions.includes(cmd.condition) ? c.conditions.filter(v => v !== cmd.condition) : [...c.conditions.filter(v => v.replace(/ \d+$/, '') !== cmd.condition.replace(/ \d+$/, '')), cmd.condition]; break;
    case 'reaction': c.reaction = !c.reaction; break;
    case 'attack': c.attacked = !c.attacked; break;
    case 'turn': Object.assign(c, { commanded: false, pa: 1, attacked: false, freeInoculationUsed: false }); break;
    case 'command':
      if (!c.hp) return fail('O companheiro está em Colapso.');
      if (c.commanded) return fail('O companheiro já recebeu este comando.');
      // Sem PA o comando continua permitido (avisa na UI); só a Reserva Tática é recurso que trava.
      if (cmd.reserve && reserve < 1) return fail('Reserva Tática insuficiente.');
      spent = 1; reserveSpent = cmd.reserve ? 1 : 0;
      c.commanded = true; c.pa = 2; break;
    case 'action': {
      const action = model.actions.find(a => a.name === cmd.name);
      if (!action) return fail('Ação desconhecida.');
      if (!c.hp) return fail('O companheiro está em Colapso.');
      const cost = companionActionCost(action, c, rank);
      if (cost > c.pa) return fail('PA do companheiro insuficientes.');
      if (action.attack && c.attacked) return fail('Ataque natural já utilizado neste turno.');
      c.pa -= cost; if (action.name === 'Inocular' && cost === 0) c.freeInoculationUsed = true; if (action.attack) c.attacked = true; break;
    }
  }
  return { companion: c, spent, reserveSpent };
}

export function companionActionCost(action: CompanionAction, c: HuntingCompanion, rank: string): number {
  return action.name === 'Inocular' && c.model === 'peconhento' && rankC(rank) && !c.freeInoculationUsed ? 0 : action.cost;
}
