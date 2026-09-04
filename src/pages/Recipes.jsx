import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTable } from '../lib/data'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/settings.jsx'
import { CHIP_COLORS } from '../lib/costing'
import { Icon } from '../lib/icons.jsx'
import Chip from '../components/Chip.jsx'
import { uploadImage, deleteImage } from '../lib/upload'
import RecipeContentDrawer from '../components/RecipeContentDrawer.jsx'

export default function Recipes() {
  const { settings } = useSettings()
  const { rows, loading, insert, update, remove } = useTable('recipes', 'name')
  const { rows: ingredients } = useTable('ingredients', 'name')
  const [bomLines, setBomLines] = useState([])
  const [f, setF] = useState({ name:'', category:'', yield_portions:'', target_food_cost_pct:'', image_url:null })

  // BOM lines aren't in useTable's registry — pull them directly so the
  // Content drawer's live preview can render the real ingredient list.
  useEffect(() => {
    supabase.from('bom_lines').select('*').then(({ data }) => setBomLines(data || []))
  }, [])

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({})

  const [contentRecipeId, setContentRecipeId] = useState(null)
  const contentRecipe = rows.find(r => r.id === contentRecipeId) || null

  // Topbar search sends users here as `/app/recipes?highlight=<id>`. Once the
  // rows have loaded, scroll the matching <tr> into view and flash it briefly.
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const rowRefs = useRef({})
  useEffect(() => {
    if (!highlightId || loading) return
    const el = rowRefs.current[highlightId]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('row-flash')
    const t = setTimeout(() => {
      el.classList.remove('row-flash')
      // Clean up the URL so a refresh doesn't re-flash
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('highlight'); return next }, { replace: true })
    }, 1800)
    return () => clearTimeout(t)
  }, [highlightId, loading, rows.length])

  function startEdit(r) {
    setEditingId(r.id)
    setDraft({
      name: r.name,
      category: r.category || '',
      yield_portions: String(r.yield_portions),
      target_food_cost_pct: String(r.target_food_cost_pct),
    })
  }
  function cancelEdit() { setEditingId(null); setDraft({}) }
  async function saveEdit() {
    if (!draft.name || !draft.yield_portions) { alert('Name and yield are required.'); return }
    await update(editingId, {
      name: draft.name.trim(),
      category: draft.category.trim() || null,
      yield_portions: parseInt(draft.yield_portions),
      target_food_cost_pct: parseFloat(draft.target_food_cost_pct) || settings.default_target_food_cost_pct,
    })
    setEditingId(null); setDraft({})
  }

  async function add() {
    if (!f.name || !f.yield_portions) { alert('Name and yield required.'); return }
    await insert({
      name: f.name.trim(),
      category: f.category.trim() || null,
      yield_portions: parseInt(f.yield_portions),
      target_food_cost_pct: parseFloat(f.target_food_cost_pct) || settings.default_target_food_cost_pct,
      image_url: f.image_url || null,
    })
    setF({ name:'', category:'', yield_portions:'', target_food_cost_pct:'', image_url:null })
  }

  // Image upload / remove — mirrors the Ingredients pattern. Existing rows
  // save immediately; the add-form buffers the URL until the row is created.
  async function handleRowImageUpload(row, file) {
    try {
      const newUrl = await uploadImage(file, 'recipes', 512)
      if (row.image_url) {
        try { await deleteImage(row.image_url) } catch (e) { console.warn('image cleanup failed', e) }
      }
      await update(row.id, { image_url: newUrl })
    } catch (e) {
      alert('Upload failed: ' + (e.message || e))
    }
  }
  async function handleRowImageRemove(row) {
    if (row.image_url) {
      try { await deleteImage(row.image_url) } catch (e) { console.warn('image cleanup failed', e) }
    }
    await update(row.id, { image_url: null })
  }
  async function handleAddImageUpload(file) {
    try {
      const newUrl = await uploadImage(file, 'recipes', 512)
      if (f.image_url) {
        try { await deleteImage(f.image_url) } catch (e) { console.warn('image cleanup failed', e) }
      }
      setF(prev => ({ ...prev, image_url: newUrl }))
    } catch (e) {
      alert('Upload failed: ' + (e.message || e))
    }
  }
  async function handleAddImageRemove() {
    if (f.image_url) {
      try { await deleteImage(f.image_url) } catch (e) { console.warn('image cleanup failed', e) }
    }
    setF(prev => ({ ...prev, image_url: null }))
  }

  async function saveContent(id, patch) {
    await update(id, patch)
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Recipe Master</h3>
          <p className="sub">
            Cakes and bakes with yield and target food-cost. Click <b>Content</b> to add method,
            description, care text, allergens, and menu visibility.
          </p>
        </div>
      </div>
      <table className="responsive-table">
        <thead>
          <tr>
            <th>Recipe</th>
            <th>Category</th>
            <th className="num">Yield</th>
            <th className="num">Target FC%</th>
            <th>Menu</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan="6" className="empty">Loading…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan="6" className="empty">No recipes yet.</td></tr>}
          {rows.map((r, idx) => {
            const color = CHIP_COLORS[idx % CHIP_COLORS.length]
            const isEditing = editingId === r.id
            const hasContent = !!(r.method?.length || r.description || r.storage_text || r.care_text || r.label_ingredients_text || r.allergens_text)

            const chip = (
              <Chip
                item={r}
                size={32}
                color={color}
                uploadable
                onUpload={(file) => handleRowImageUpload(r, file)}
                onRemove={r.image_url ? () => handleRowImageRemove(r) : null}
              />
            )

            if (isEditing) {
              return (
                <tr key={r.id} ref={el => { rowRefs.current[r.id] = el }} className="editing" style={{background:'#fafaff'}}>
                  <td>
                    <div className="row-name">
                      {chip}
                      <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} style={{width:240}}/>
                    </div>
                  </td>
                  <td data-label="Category"><input value={draft.category} onChange={e => setDraft({...draft, category: e.target.value})} style={{width:130}} placeholder="Category"/></td>
                  <td className="num" data-label="Yield"><input type="number" value={draft.yield_portions} onChange={e => setDraft({...draft, yield_portions: e.target.value})} style={{width:80, textAlign:'right'}}/></td>
                  <td className="num" data-label="Target FC%"><input type="number" value={draft.target_food_cost_pct} onChange={e => setDraft({...draft, target_food_cost_pct: e.target.value})} style={{width:80, textAlign:'right'}}/></td>
                  <td/>
                  <td>
                    <div className="action-cell">
                      <button className="primary" onClick={saveEdit}>Save</button>
                      <button className="ghost" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </td>
                </tr>
              )
            }

            return (
              <tr key={r.id} ref={el => { rowRefs.current[r.id] = el }}>
                <td>
                  <div className="row-name">
                    {chip}
                    <strong>{r.name}</strong>
                  </div>
                </td>
                <td data-label="Category"><span className="pill bridge">{r.category || '—'}</span></td>
                <td className="num" data-label="Yield">{r.yield_portions}</td>
                <td className="num" data-label="Target FC%">{r.target_food_cost_pct}%</td>
                <td data-label="Menu">
                  {r.show_in_menu === false
                    ? <span className="pill err">hidden</span>
                    : <span className="pill ok">visible</span>}
                </td>
                <td>
                  <div className="action-cell">
                    <button
                      className={hasContent ? 'primary' : 'ghost'}
                      onClick={() => setContentRecipeId(r.id)}
                      title="Edit method, description, care text, label and menu display"
                      style={{ fontSize: 12, padding: '6px 10px' }}>
                      Content
                    </button>
                    <button className="edit" onClick={() => startEdit(r)} title="Edit"><Icon name="edit" size={13}/></button>
                    <button className="ghost" onClick={() => remove(r.id)} title="Remove"><Icon name="trash" size={13}/></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="row-add">
        <Chip
          item={{ name: f.name || 'New', image_url: f.image_url }}
          size={32}
          uploadable
          onUpload={handleAddImageUpload}
          onRemove={f.image_url ? handleAddImageRemove : null}
        />
        <div className="field"><label>Name</label><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="e.g. Chocolate Fudge Cake" style={{width:240}}/></div>
        <div className="field"><label>Category</label><input value={f.category} onChange={e=>setF({...f,category:e.target.value})} placeholder="Cake / Cupcake" style={{width:150}}/></div>
        <div className="field"><label>Yield</label><input type="number" value={f.yield_portions} onChange={e=>setF({...f,yield_portions:e.target.value})} style={{width:100}}/></div>
        <div className="field"><label>Target FC %</label><input type="number" value={f.target_food_cost_pct} onChange={e=>setF({...f,target_food_cost_pct:e.target.value})} placeholder={String(settings.default_target_food_cost_pct)} style={{width:110}}/></div>
        <button className="primary" onClick={add}>+ Add Recipe</button>
      </div>

      {contentRecipe && (
        <RecipeContentDrawer
          recipe={contentRecipe}
          brand={settings}
          bomLines={bomLines}
          ingredients={ingredients}
          onClose={() => setContentRecipeId(null)}
          onSave={patch => saveContent(contentRecipe.id, patch)}
        />
      )}
    </div>
  )
}
