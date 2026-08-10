import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTable } from '../lib/data'
import { UNITS, UNIT_KEYS } from '../lib/units'
import { useSettings } from '../lib/settings.jsx'
import { unitCostBase, money, CHIP_COLORS } from '../lib/costing'
import { Icon } from '../lib/icons.jsx'
import Chip from '../components/Chip.jsx'
import { uploadImage, deleteImage } from '../lib/upload'

const EMPTY_FORM = { name:'', purchase_unit:'g', purchase_qty:'', purchase_price:'', waste_pct:'0', density_g_ml:'', image_url: null }

export default function Ingredients() {
  const { settings } = useSettings()
  const { rows, loading, insert, update, remove: baseRemove } = useTable('ingredients', 'name')
  const [f, setF] = useState(EMPTY_FORM)

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({})

  const nextColor = CHIP_COLORS[rows.length % CHIP_COLORS.length]

  // Topbar search sends users here as `/app/ingredients?highlight=<id>`.
  // Scroll the matching <tr> into view and flash it briefly once loaded.
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
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('highlight'); return next }, { replace: true })
    }, 1800)
    return () => clearTimeout(t)
  }, [highlightId, loading, rows.length])

  function startEdit(i) {
    setEditingId(i.id)
    setDraft({
      name: i.name,
      purchase_unit: i.purchase_unit,
      purchase_qty: String(i.purchase_qty),
      purchase_price: String(i.purchase_price),
      waste_pct: String(i.waste_pct ?? 0),
      density_g_ml: i.density_g_ml === null || i.density_g_ml === undefined ? '' : String(i.density_g_ml),
    })
  }
  function cancelEdit() { setEditingId(null); setDraft({}) }
  async function saveEdit() {
    if (!draft.name || !draft.purchase_qty || !draft.purchase_price) { alert('Name, qty and price are required.'); return }
    await update(editingId, {
      name: draft.name.trim(),
      purchase_unit: draft.purchase_unit,
      purchase_qty: parseFloat(draft.purchase_qty),
      purchase_price: parseFloat(draft.purchase_price),
      waste_pct: parseFloat(draft.waste_pct) || 0,
      density_g_ml: draft.density_g_ml === '' ? null : parseFloat(draft.density_g_ml),
    })
    setEditingId(null); setDraft({})
  }

  async function remove(id) {
    const row = rows.find(r => r.id === id)
    if (row?.image_url) {
      try { await deleteImage(row.image_url) } catch (e) { console.warn('image cleanup failed', e) }
    }
    await baseRemove(id)
  }

  async function handleRowImageUpload(row, file) {
    try {
      const newUrl = await uploadImage(file, 'ingredients', 512)
      if (row.image_url) {
        try { await deleteImage(row.image_url) } catch (e) { console.warn(e) }
      }
      await update(row.id, { image_url: newUrl })
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
  }

  async function handleRowImageRemove(row) {
    if (row.image_url) {
      try { await deleteImage(row.image_url) } catch (e) { console.warn(e) }
    }
    await update(row.id, { image_url: null })
  }

  async function handleAddImageUpload(file) {
    try {
      const newUrl = await uploadImage(file, 'ingredients', 512)
      if (f.image_url) {
        try { await deleteImage(f.image_url) } catch (e) { console.warn(e) }
      }
      setF(prev => ({ ...prev, image_url: newUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
  }
  async function handleAddImageRemove() {
    if (f.image_url) {
      try { await deleteImage(f.image_url) } catch (e) { console.warn(e) }
    }
    setF(prev => ({ ...prev, image_url: null }))
  }

  async function add() {
    if (!f.name || !f.purchase_qty || !f.purchase_price) { alert('Name, qty and price are required.'); return }
    await insert({
      name: f.name.trim(),
      purchase_unit: f.purchase_unit,
      purchase_qty: parseFloat(f.purchase_qty),
      purchase_price: parseFloat(f.purchase_price),
      waste_pct: parseFloat(f.waste_pct) || 0,
      density_g_ml: f.density_g_ml === '' ? null : parseFloat(f.density_g_ml),
      color: nextColor,
      image_url: f.image_url,
    })
    setF(EMPTY_FORM)
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Ingredient Master</h3>
          <p className="sub">Bulk purchase in → unit cost auto-calculated. Click any chip to view or add a photo.</p>
        </div>
      </div>
      <table className="responsive-table">
        <thead>
          <tr><th>Ingredient</th><th>Unit</th><th className="num">Qty</th><th className="num">Price ({settings.currency})</th>
              <th className="num">Waste %</th><th className="num">Density</th><th className="num">Cost / base</th><th></th></tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan="8" className="empty">Loading…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan="8" className="empty">No ingredients yet.</td></tr>}
          {rows.map(i => {
            const dim = UNITS[i.purchase_unit]?.dim
            const baseLabel = dim === 'mass' ? 'g' : dim === 'volume' ? 'ml' : 'pcs'
            const isEditing = editingId === i.id

            const chip = (
              <Chip
                item={i}
                size={32}
                uploadable
                onUpload={(file) => handleRowImageUpload(i, file)}
                onRemove={i.image_url ? () => handleRowImageRemove(i) : null}
              />
            )

            if (isEditing) {
              return (
                <tr key={i.id} ref={el => { rowRefs.current[i.id] = el }} className="editing" style={{background:'#fafaff'}}>
                  <td>
                    <div className="row-name">
                      {chip}
                      <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} placeholder="Name" style={{width:180}}/>
                    </div>
                  </td>
                  <td data-label="Unit">
                    <select value={draft.purchase_unit} onChange={e => setDraft({...draft, purchase_unit: e.target.value})} style={{width:80}}>
                      {UNIT_KEYS.map(u => <option key={u} value={u}>{UNITS[u].label}</option>)}
                    </select>
                  </td>
                  <td className="num" data-label="Qty"><input type="number" step="0.01" placeholder="Qty" value={draft.purchase_qty} onChange={e => setDraft({...draft, purchase_qty: e.target.value})} style={{width:90, textAlign:'right'}}/></td>
                  <td className="num" data-label="Price"><input type="number" step="0.01" placeholder="Price" value={draft.purchase_price} onChange={e => setDraft({...draft, purchase_price: e.target.value})} style={{width:100, textAlign:'right'}}/></td>
                  <td className="num" data-label="Waste %"><input type="number" step="1" placeholder="Waste %" value={draft.waste_pct} onChange={e => setDraft({...draft, waste_pct: e.target.value})} style={{width:70, textAlign:'right'}}/></td>
                  <td className="num" data-label="Density"><input type="number" step="0.01" value={draft.density_g_ml} onChange={e => setDraft({...draft, density_g_ml: e.target.value})} placeholder="Density g/ml" style={{width:80, textAlign:'right'}}/></td>
                  <td className="num" data-label="Cost/base" style={{color:'var(--muted)', fontStyle:'italic'}}>recomputes on save</td>
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
              <tr key={i.id} ref={el => { rowRefs.current[i.id] = el }}>
                <td>
                  <div className="row-name">
                    {chip}
                    <strong>{i.name}</strong>
                  </div>
                </td>
                <td data-label="Unit">{UNITS[i.purchase_unit]?.label ?? i.purchase_unit}</td>
                <td className="num" data-label="Qty">{i.purchase_qty}</td>
                <td className="num" data-label="Price">{Number(i.purchase_price).toFixed(2)}</td>
                <td className="num" data-label="Waste %">{i.waste_pct || 0}%</td>
                <td className="num" data-label="Density">{i.density_g_ml ?? '—'}</td>
                <td className="num" data-label="Cost / base"><strong>{money(unitCostBase(i), settings.currency)}</strong>/{baseLabel}</td>
                <td>
                  <div className="action-cell">
                    <button className="edit" onClick={() => startEdit(i)} title="Edit"><Icon name="edit" size={13}/></button>
                    <button className="ghost" onClick={() => remove(i.id)} title="Remove"><Icon name="trash" size={13}/></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="row-add">
        <div className="field">
          <label>Photo</label>
          <Chip
            item={{ name: f.name || 'New', image_url: f.image_url }}
            size={38}
            color={nextColor}
            uploadable
            onUpload={handleAddImageUpload}
            onRemove={f.image_url ? handleAddImageRemove : null}
          />
        </div>
        <div className="field"><label>Name</label><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="e.g. Cocoa Powder" style={{width:200}}/></div>
        <div className="field"><label>Unit</label>
          <select value={f.purchase_unit} onChange={e=>setF({...f,purchase_unit:e.target.value})} style={{width:90}}>
            {UNIT_KEYS.map(u => <option key={u} value={u}>{UNITS[u].label}</option>)}
          </select>
        </div>
        <div className="field"><label>Qty</label><input type="number" step="0.01" value={f.purchase_qty} onChange={e=>setF({...f,purchase_qty:e.target.value})} style={{width:100}}/></div>
        <div className="field"><label>Price</label><input type="number" step="0.01" value={f.purchase_price} onChange={e=>setF({...f,purchase_price:e.target.value})} style={{width:110}}/></div>
        <div className="field"><label>Waste %</label><input type="number" step="1" value={f.waste_pct} onChange={e=>setF({...f,waste_pct:e.target.value})} style={{width:90}}/></div>
        <div className="field"><label>Density g/ml</label><input type="number" step="0.01" value={f.density_g_ml} onChange={e=>setF({...f,density_g_ml:e.target.value})} style={{width:110}} placeholder="opt."/></div>
        <button className="primary" onClick={add}>+ Add Ingredient</button>
      </div>
    </div>
  )
}
