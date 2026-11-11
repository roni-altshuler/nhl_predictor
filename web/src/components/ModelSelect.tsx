import { MODELS, MODEL_NAMES, type Model } from '../lib/model'
export default function ModelSelect({ model, onChange }: { model: Model; onChange: (model: Model) => void }) {
  return <label className="control"><span>Replay model</span><select value={model} onChange={e => onChange(e.target.value as Model)}>{MODELS.map(m => <option key={m} value={m}>{MODEL_NAMES[m]}</option>)}</select></label>
}
