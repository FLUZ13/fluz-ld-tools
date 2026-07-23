import { Calculator, Coins, PawPrint, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

function NumberField({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return <label className="calculator-field"><span>{label}</span><input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} /></label>;
}

export function Calculators() {
  const [baseAttack, setBaseAttack] = useState(100000);
  const [attackBonus, setAttackBonus] = useState(500);
  const [damageBonus, setDamageBonus] = useState(100);
  const [skillMultiplier, setSkillMultiplier] = useState(1000);
  const [skillBonus, setSkillBonus] = useState(0);
  const [levels, setLevels] = useState(3);
  const [attemptCost, setAttemptCost] = useState(28000);
  const [successRate, setSuccessRate] = useState(12);
  const [petLevels, setPetLevels] = useState(5);
  const [petFragments, setPetFragments] = useState(20);
  const [petCoins, setPetCoins] = useState(10000);
  const [budget, setBudget] = useState(250000);

  const damage = useMemo(() => baseAttack * (1 + attackBonus / 100) * (skillMultiplier / 100) * (1 + damageBonus / 100) * (1 + skillBonus / 100), [attackBonus, baseAttack, damageBonus, skillBonus, skillMultiplier]);
  const upgradeCost = successRate > 0 ? levels * attemptCost / (successRate / 100) : 0;
  const petCost = petLevels * petCoins;
  const affordable = petCoins > 0 ? Math.floor(budget / petCoins) : 0;

  return (
    <main className="calculators-page">
      <section className="tools-heading"><h1>Lucky Defense calculators</h1><p>Fast local planning tools. Every value stays editable so the calculators remain useful when balance values change.</p></section>
      <div className="calculator-grid">
        <section className="calculator-panel"><header><Calculator /><div><h2>Base damage</h2><span>Attack, damage type and skill scaling</span></div></header><div className="calculator-fields"><NumberField label="Base ATK" value={baseAttack} onChange={setBaseAttack} /><NumberField label="ATK increase %" value={attackBonus} onChange={setAttackBonus} /><NumberField label="Physical / Magic DMG %" value={damageBonus} onChange={setDamageBonus} /><NumberField label="Skill multiplier %" value={skillMultiplier} onChange={setSkillMultiplier} /><NumberField label="Skill DMG %" value={skillBonus} onChange={setSkillBonus} /></div><output><span>Estimated hit</span><strong>{Math.round(damage).toLocaleString()}</strong></output></section>
        <section className="calculator-panel"><header><Coins /><div><h2>Unit upgrade cost</h2><span>Expected cost across success rolls</span></div></header><div className="calculator-fields"><NumberField label="Successful levels needed" value={levels} onChange={setLevels} /><NumberField label="Cost per attempt" value={attemptCost} onChange={setAttemptCost} /><NumberField label="Success rate %" value={successRate} onChange={setSuccessRate} min={0.1} step={0.1} /></div><output><span>Expected coin cost</span><strong>{Math.round(upgradeCost).toLocaleString()}</strong></output></section>
        <section className="calculator-panel"><header><PawPrint /><div><h2>Pet upgrade cost</h2><span>Fragments and coins for a target</span></div></header><div className="calculator-fields"><NumberField label="Levels planned" value={petLevels} onChange={setPetLevels} /><NumberField label="Fragments per level" value={petFragments} onChange={setPetFragments} /><NumberField label="Coins per level" value={petCoins} onChange={setPetCoins} /></div><output><span>Total</span><strong>{(petLevels * petFragments).toLocaleString()} fragments + {petCost.toLocaleString()} coins</strong></output></section>
        <section className="calculator-panel"><header><Sparkles /><div><h2>Pet level optimizer</h2><span>Quick budget comparison</span></div></header><div className="calculator-fields"><NumberField label="Coin budget" value={budget} onChange={setBudget} /><NumberField label="Average coin cost / level" value={petCoins} onChange={setPetCoins} /></div><output><span>Affordable levels</span><strong>{affordable.toLocaleString()}</strong></output><p className="calculator-note">Prioritize the pet with the strongest relevant breakpoint, then compare its next-level gain against this budget.</p></section>
      </div>
    </main>
  );
}
