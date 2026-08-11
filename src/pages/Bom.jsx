import { useEffect, useMemo, useState } from 'react'
import { useTable, useBomLines } from '../lib/data'
import { UNITS, UNIT_KEYS } from '../lib/units'
import { useSettings } from '../lib/settings.jsx'
import { lineCost, money } from '../lib/costing'
import { Icon } from '../lib/icons.jsx'
import Chip from '../components/Chip.jsx'
import RecipePicker from '../components/RecipePicker'

// ---------------------------------------------------------------------------
// Yield-override storage
// ---------------------------------------------------------------------------
// The BOM has a "planning" yield-modifier that scales displayed quantities +
// costs while leaving the stored recipe-native qty untouched. Overrides
// persist per-recipe in localStorage so a page reload keeps whatever batch
// size you were planning. Clearing the input or pressing Default removes
// the entry.
const OVERRIDE_KEY = (recipeId) => `bom:yield-override:${recipeId}`
function readOverride(recipeId) {
  if (!recipeId || typeof window === 'undefined') return ''
  try { return window.localStorage.getItem(OVERRIDE_KEY(recipeId)) ?? '' } catch { return '' }
}
function writeOverride(recipeId, value) {
  if (!recipeId || typeof window === 'undefined') return
  try {
    if (value === '' || value == null) window.localStorage.removeItem(OVERRIDE_KEY(recipeId))
    else window.localStorage.setItem(OVERRIDE_KEY(recipeId), String(value))
  } catch { /* localStorage blocked — override becomes session-only, no harm */ }
}

export default function Bom() {
  const { settings } = useSettings()
  const { rows: recipes } = useTable('recipes', 'name')
  const { rows: ingredients } = useTable('ingredients', 'name')
  const [recipeId, setRecipeId] = useState(null)

  useEffect(() => { if (!recipeId && recipes.length) setRecipeId(recipes[0].id) }, [recipes, recipeId])

  const { lines, addLine, updateLine, removeLine } = useBomLines(recipeId)
  const ingById = useMemo(() => Object.fromEntries(ingredients.map(i => [i.id, i])), [ingredients])

  // Active recipe + yield override --------------------------------------------
  const recipe = recipes.find(r => r.id === recipeId) || null
  const defaultYield = Math.max(Number(recipe?.yield_portions) || 1, 1)
  const [yieldInput, setYieldInput] = useState('')

  // Load persisted override whenever the active recipe changes
  useEffect(() => {
    setYieldInput(readOverride(recipeId))
  }, [recipeId])

  const activeYield = (() => {
    const parsed = parseFloat(yieldInput)
    return parsed > 0 ? parsed : defaultYield
  })()
  const scaleFactor = activeYield / defaultYield
  const isScaled = Math.abs(scaleFactor - 1) > 1e-6

  function onYieldChange(next) {
    setYieldInput(next)
    // Only persist meaningful overrides (parseable, positive, different from
    // the recipe default). Everything else clears the override so a reload
    // shows the recipe's native yield.
    const parsed = parseFloat(next)
    if (parsed > 0 && Math.abs(parsed - defaultYield) > 1e-6) {
      writeOverride(recipeId, parsed)
    } else {
      writeOverride(recipeId, '')
    }
  }

  function resetYield() {
    setYieldInput('')
    writeOverride(recipeId, '')
  }

  const [f, setF] = useState({ ingredient_id:'', qty:'', unit:'g' })
  useEffect(() => {
    if (!f.ingredient_id && ingredients.length) setF(s => ({ ...s, ingredient_id: ingredients[0].id }))
  }, [ingredients, f.ingredient_id])

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({})

  function startEdit(l) {
    setEditingId(l.id)
    setDraft({ ingredient_id: l.ingredient_id, qty: String(l.qty), unit: l.unit })
  }
  function cancelEdit() { setEditingId(null); setDraft({}) }
  async function saveEdit() {
    if (!draft.ingredient_id || !draft.qty) { alert('Pick ingredient and enter qty.'); return }
    await updateLine(editingId, {
      ingredient_id: draft.ingredient_id,
      qty: parseFloat(draft.qty),
      unit: draft.unit,
    })
    setEditingId(null); setDraft({})
  }

  if (recipes.length === 0) return <div className="panel"><p className="empty">Add a recipe first in Recipe Master.</p></div>

  async function add() {
    if (!f.ingredient_id || !f.qty) { alert('Pick an ingredient and enter qty.'); return }
    await addLine({ ingredient_id: f.ingredient_id, qty: parseFloat(f.qty), unit: f.unit })
    setF({ ...f, qty:'' })
  }

  return (
    <>
      <RecipePicker recipes={recipes} value={recipeId} onChange={setRecipeId}/>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Recipe BOM</h3>
            <p className="sub">
              Recipe yields <b>{defaultYield}</b>. Use whatever unit the recipe is written in —
              conversion happens against the ingredient's purchase unit.
            </p>
          </div>
        </div>

        {/* Yield modifier — scales displayed qty + cost without touching stored values */}
        <div className={`bom-yield-bar${isScaled ? ' is-scaled' : ''}`}>
          <div className="bom-yield-field">
            <label htmlFor="bom-yield-input">Batch yield</label>
            <input
              id="bom-yield-input"
              type="number"
              min="0"
              step="0.01"
              value={yieldInput}
              onChange={e => onYieldChange(e.target.value)}
              placeholder={String(defaultYield)}
            />
            <span className="bom-yield-native">of {defaultYield} default</span>
          </div>
          <div className="bom-yield-scale">
            {isScaled
              ? <span className="pill bridge">×{scaleFactor.toFixed(2).replace(/\.?0+$/, '')} preview</span>
              : <span className="pill ok">at recipe scale</span>}
          </div>
          <button
            type="button"
            className="ghost"
            onClick={resetYield}
            disabled={!isScaled && yieldInput === ''}
            title="Restore the recipe's default yield"
          >
            Reset to default
          </button>
        </div>

        <div className="conv-box">
          <div className="conv-icon"><Icon name="arrows" size={16}/></div>
          <div>
            <b>Conversion rules:</b> g ↔ kg, oz ↔ lb, ml ↔ L ↔ tsp/tbsp/cup convert exactly.
            Crossing mass ↔ volume (e.g. <b>cups of butter</b> against a <b>kg</b> purchase) uses each ingredient's density. Missing density is flagged, not silently guessed.
          </div>
        </div>

        <div>
          {lines.length === 0 && <p className="empty">No ingredients linked yet.</p>}
          {lines.map(l => {
            const ing = ingById[l.ingredient_id]
            const isEditing = editingId === l.id

            if (isEditing) {
              return (
                <div key={l.id} className="bom-line editing" style={{background:'#fafaff', borderColor:'#dedafc'}}>
                  <select value={draft.ingredient_id} onChange={e => setDraft({...draft, ingredient_id: e.target.value})}>
                    {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <input type="number" step="0.01" placeholder="Qty" value={draft.qty} onChange={e => setDraft({...draft, qty: e.target.value})}/>
                  <select value={draft.unit} onChange={e => setDraft({...draft, unit: e.target.value})}>
                    {UNIT_KEYS.map(u => <option key={u} value={u}>{UNITS[u].label}</option>)}
                  </select>
                  <div/>
                  <div className="action-cell">
                    <button className="primary" onClick={saveEdit}>Save</button>
                    <button className="ghost" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              )
            }

            if (!ing) return (
              <div key={l.id} className="bom-line">
                <div>(deleted ingredient)</div><div/><div/><div/>
                <button className="ghost" onClick={() => removeLine(l.id)}>Remove</button>
              </div>
            )
            // Display qty + cost scale by the yield modifier. The stored qty
            // and unit in bom_lines never change; the multiplier is a display
            // preview only. Add / Edit still enter recipe-native values.
            const displayQty = l.qty * scaleFactor
            const r = lineCost(ing, displayQty, l.unit)
            const badge = !r.ok ? <span className="pill err">no conversion</span>
              : r.bridged ? <span className="pill bridge">via density</span>
              : <span className="pill ok">direct</span>
            // Neat qty rendering: keep ints as ints, otherwise up to 3dp trimmed
            const qtyText = Number.isInteger(displayQty)
              ? String(displayQty)
              : displayQty.toFixed(3).replace(/\.?0+$/, '')
            return (
              <div key={l.id} className="bom-line">
                <div className="row-name"><Chip item={ing} size={28}/><strong>{ing.name}</strong></div>
                <div className="num">
                  {qtyText} {UNITS[l.unit]?.label}
                  {isScaled && <span className="bom-line-native"> ({l.qty} × {scaleFactor.toFixed(2).replace(/\.?0+$/, '')})</span>}
                </div>
                <div>{badge}</div>
                <div className="num"><strong>{r.ok ? money(r.cost, settings.currency) : '—'}</strong></div>
                <div className="action-cell">
                  <button className="edit" onClick={() => startEdit(l)} title="Edit"><Icon name="edit" size={13}/></button>
                  <button className="ghost" onClick={() => removeLine(l.id)} title="Remove"><Icon name="trash" size={13}/></button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="bom-line" style={{marginTop:14, background:'#fafaff', borderStyle:'dashed'}}>
          <select value={f.ingredient_id} onChange={e=>setF({...f,ingredient_id:e.target.value})}>
            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="qty" value={f.qty} onChange={e=>setF({...f,qty:e.target.value})}/>
          <select value={f.unit} onChange={e=>setF({...f,unit:e.target.value})}>
            {UNIT_KEYS.map(u => <option key={u} value={u}>{UNITS[u].label}</option>)}
          </select>
          <div/>
          <button className="primary" onClick={add}>+ Add</button>
        </div>
        {isScaled && (
          <p className="bom-yield-hint">
            You're viewing a ×{scaleFactor.toFixed(2).replace(/\.?0+$/, '')} preview.
            Add / Edit still enter recipe-scale quantities — the multiplier is display only.
          </p>
        )}
      </div>
    </>
  )
}
