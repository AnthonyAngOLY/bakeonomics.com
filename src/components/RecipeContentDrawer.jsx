import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../lib/icons.jsx'
import { getTemplateComponent } from './templates/index.js'
import { DEFAULT_STYLE_KEY } from '../lib/template-styles.js'
import { unitCostBase, lineCost } from '../lib/costing.js'
import './rcd-styles.css'

/**
 * Recipe Content Drawer
 *
 * Modal for editing all the per-recipe fields that feed the templates:
 *   • Method       — ordered list of steps, with optional sub-group labels
 *   • Marketing    — description (short tagline, used on Social Card)
 *   • Care & Label — care_text, storage_text, allergens_text,
 *                    label_ingredients_text (override), label_allergens_text (override)
 *   • Menu Display — show_in_menu boolean
 *
 * The `brand` prop is the settings object — used both to show defaults as
 * placeholders and to render the live preview pane on the right.
 *
 * The `bomLines` and `ingredients` props power the preview's ingredient list
 * and cost calculations. When they're empty the previews still render usefully
 * (empty state or fallback text) so the drawer stays functional on pages that
 * don't hydrate those tables.
 */
export default function RecipeContentDrawer({
  recipe,
  brand = {},
  bomLines = [],
  ingredients = [],
  onClose,
  onSave,
}) {
  const [tab, setTab] = useState('method')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Preview open by default on desktop, closed on phones so the form is
  // immediately usable — user can tap the toggle to peek at the preview.
  const [previewOpen, setPreviewOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 1024 : true
  )

  // Draft mirrors editable fields from the recipe
  const [draft, setDraft] = useState(() => initialDraft(recipe))

  useEffect(() => {
    setDraft(initialDraft(recipe))
    setDirty(false)
  }, [recipe.id])

  function patchDraft(patch) {
    setDraft(d => ({ ...d, ...patch }))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    // Strip empty method rows and trim whitespace right before persisting —
    // during editing we tolerate blank rows so newly-added steps stay visible
    // and typable.
    const payload = { ...draft, method: commitMethod(draft.method) }
    await onSave(payload)
    setSaving(false)
    setDirty(false)
  }

  // Enrich the recipe with draft fields + computed cost lines so previews
  // update as the user types.
  const enriched = useMemo(
    () => enrichForPreview(recipe, draft, bomLines, ingredients),
    [recipe, draft, bomLines, ingredients],
  )

  const previewMeta = PREVIEW_MAP[tab]

  return (
    <div className="rcd-overlay" onClick={onClose}>
      <div
        className={
          'rcd-modal rcd-modal-wide' +
          (previewOpen ? ' rcd-modal-preview-open' : ' rcd-modal-preview-closed')
        }
        onClick={e => e.stopPropagation()}
      >
        <div className="rcd-header">
          <div>
            <div className="rcd-eyebrow">Recipe Content</div>
            <h2 className="rcd-title">{recipe.name}</h2>
          </div>
          <div className="rcd-header-actions">
            <button
              className="rcd-preview-toggle"
              onClick={() => setPreviewOpen(v => !v)}
              title={previewOpen ? 'Hide preview' : 'Show preview'}
            >
              {previewOpen ? 'Hide preview' : 'Show preview'}
            </button>
            <button className="rcd-close" onClick={onClose} aria-label="Close">
              <Icon name="trash" size={16}/>
            </button>
          </div>
        </div>

        <div className="rcd-tabs">
          <RcdTab active={tab === 'method'}    onClick={() => setTab('method')}>Method</RcdTab>
          <RcdTab active={tab === 'marketing'} onClick={() => setTab('marketing')}>Marketing</RcdTab>
          <RcdTab active={tab === 'care'}      onClick={() => setTab('care')}>Care &amp; Storage</RcdTab>
          <RcdTab active={tab === 'label'}     onClick={() => setTab('label')}>Product Label</RcdTab>
          <RcdTab active={tab === 'menu'}      onClick={() => setTab('menu')}>Menu Display</RcdTab>
        </div>

        <div className="rcd-split">
          <div className="rcd-body">
            {tab === 'method'    && <MethodEditor value={draft.method} onChange={m => patchDraft({ method: m })}/>}
            {tab === 'marketing' && <MarketingEditor value={draft.description} onChange={d => patchDraft({ description: d })}/>}
            {tab === 'care'      && (
              <CareEditor
                care={draft.care_text}
                storage={draft.storage_text}
                allergens={draft.allergens_text}
                defaults={{
                  care:      brand.default_care_text,
                  storage:   brand.default_storage_notes,
                  allergens: brand.default_allergen_notice,
                }}
                onChange={patchDraft}
              />
            )}
            {tab === 'label'     && (
              <LabelEditor
                ingredients={draft.label_ingredients_text}
                allergens={draft.label_allergens_text}
                defaults={{
                  allergens: brand.default_allergen_notice,
                }}
                onChange={patchDraft}
              />
            )}
            {tab === 'menu'      && <MenuEditor value={draft.show_in_menu} onChange={v => patchDraft({ show_in_menu: v })}/>}
          </div>

          {previewOpen && (
            <aside className="rcd-preview-pane">
              <div className="rcd-preview-head">
                <div>
                  <div className="rcd-preview-eyebrow">Live preview</div>
                  <div className="rcd-preview-name">{previewMeta.label}</div>
                </div>
                <div className={'rcd-preview-badge ' + (dirty ? 'is-dirty' : 'is-clean')}>
                  {dirty ? 'Unsaved' : 'Saved'}
                </div>
              </div>
              <div className="rcd-preview-viewport">
                <PreviewStage
                  templateKey={previewMeta.templateKey}
                  scale={previewMeta.scale}
                  recipe={enriched}
                  brand={brand}
                />
              </div>
              <div className="rcd-preview-hint">
                {previewMeta.hint}
              </div>
            </aside>
          )}
        </div>

        <div className="rcd-footer">
          <div className="rcd-footer-hint">
            {dirty ? <>Unsaved changes.</> : <>Saved.</>}
          </div>
          <div className="rcd-footer-actions">
            <button className="ghost" onClick={onClose}>Close</button>
            <button className="primary" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Draft + enrichment
// ============================================================================

function initialDraft(recipe) {
  return {
    method:                  Array.isArray(recipe.method) ? recipe.method : [],
    description:             recipe.description || '',
    care_text:               recipe.care_text || '',
    storage_text:            recipe.storage_text || '',
    allergens_text:          recipe.allergens_text || '',
    label_ingredients_text:  recipe.label_ingredients_text || '',
    label_allergens_text:    recipe.label_allergens_text || '',
    show_in_menu:            recipe.show_in_menu !== false,
  }
}

/**
 * Assemble the object the template components expect. Merges the persisted
 * recipe with the current draft, adds computed lines[], total_cost,
 * cost_per_portion, suggested_price.
 */
function enrichForPreview(recipe, draft, bomLines, ingredients) {
  const ingById = Object.fromEntries((ingredients || []).map(i => [i.id, i]))
  const recipeBom = (bomLines || []).filter(l => l.recipe_id === recipe.id)

  const lines = recipeBom.map(l => {
    const ing = ingById[l.ingredient_id]
    if (!ing) {
      return { ingredient_name: 'Unknown', qty: l.qty, unit: l.unit, cost: 0, unit_cost: 0 }
    }
    const r = lineCost(ing, l.qty, l.unit)
    return {
      ingredient_name: ing.name,
      qty: l.qty,
      unit: l.unit,
      cost: r.ok ? r.cost : 0,
      unit_cost: unitCostBase(ing),
    }
  })

  const totalCost   = lines.reduce((sum, l) => sum + (l.cost || 0), 0)
  const perPortion  = recipe.yield_portions > 0 ? totalCost / recipe.yield_portions : 0
  const targetFC    = Number(recipe.target_food_cost_pct) || 30
  const suggested   = targetFC > 0 ? perPortion / (targetFC / 100) : 0

  return {
    ...recipe,
    ...draft,
    lines,
    total_cost:            totalCost,
    cost_per_portion:      perPortion,
    target_food_cost_pct:  targetFC,
    suggested_price:       suggested,
  }
}

// ============================================================================
// Preview stage — resolves the right template component and scales it
// ============================================================================

const PREVIEW_MAP = {
  method:    {
    templateKey: 'classic',
    label: 'Recipe Card',
    scale: 0.52,
    hint: 'The Recipe Card (A5) uses the method steps you edit here — plus ingredients from Recipe BOM.',
  },
  marketing: {
    templateKey: 'social',
    label: 'Social Media Card',
    scale: 0.62,
    hint: 'The Social Card square uses this description as the italic sub-line under the product name.',
  },
  care:      {
    templateKey: 'care',
    label: 'Care & Storage Card',
    scale: 0.72,
    hint: 'The Care Card (A6) shows storage/allergens; blank fields fall back to brand defaults.',
  },
  label:     {
    templateKey: 'label',
    label: 'Product Label',
    scale: 0.90,
    hint: 'The Product Label (A7) uses the ingredient override + allergen line you set here.',
  },
  menu:      {
    templateKey: null,
    label: 'Menu row',
    scale: 1,
    hint: 'Menu Insert and Wholesale Price List are multi-recipe templates — this preview shows only the row.',
  },
}

function PreviewStage({ templateKey, scale, recipe, brand }) {
  // Menu tab has no per-recipe template — render a mini row.
  if (!templateKey) {
    return (
      <div className="rcd-preview-menu-row">
        <div className={'rcd-preview-menu-inner ' + (recipe.show_in_menu ? 'is-shown' : 'is-hidden')}>
          {recipe.show_in_menu ? (
            <>
              <div className="rcd-preview-menu-line">
                <span className="rcd-preview-menu-name">{recipe.name || 'Product name'}</span>
                <span className="rcd-preview-menu-price">
                  {(brand.currency || 'RM')} {Number(recipe.suggested_price || 0).toFixed(2)}
                </span>
              </div>
              {recipe.description && (
                <div className="rcd-preview-menu-desc">{recipe.description}</div>
              )}
              <div className="rcd-preview-menu-note">
                ✓ Appears on Menu Insert &amp; Wholesale Price List
              </div>
            </>
          ) : (
            <div className="rcd-preview-menu-note is-off">
              ✗ Hidden from Menu Insert &amp; Wholesale Price List
            </div>
          )}
        </div>
      </div>
    )
  }

  const { Component } = getTemplateComponent(templateKey, DEFAULT_STYLE_KEY)
  if (!Component) {
    return <div className="rcd-preview-empty">Template not available.</div>
  }

  return (
    <div className="rcd-preview-scaler" style={{ '--rcd-preview-scale': scale }}>
      <Component recipe={recipe} brand={brand}/>
    </div>
  )
}

function RcdTab({ active, onClick, children }) {
  return (
    <button className={'rcd-tab' + (active ? ' active' : '')} onClick={onClick}>
      {children}
    </button>
  )
}

// ============================================================================
// Method editor — ordered list of steps, with optional sub-group headings
// ============================================================================
function MethodEditor({ value, onChange }) {
  const items = useMemo(() => {
    return (value || []).map(v => {
      if (typeof v === 'string') return { step: v }
      return { step: v.step || v.text || '', group: v.group || v.group_label || v.groupLabel || '' }
    })
  }, [value])

  // Pass items through raw during editing. The old cleanup() also filtered
  // blank rows, which meant addStep({step:''}) got stripped before it could
  // render — "+ Add step" appeared broken. Cleanup now runs only at save time
  // (see commitMethod at the bottom of this file); mid-edit blanks are fine.
  function update(i, patch) {
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }
  function addStep() {
    onChange([...items, { step: '', group: '' }])
  }
  function removeAt(i) {
    onChange(items.filter((_, idx) => idx !== i))
  }
  function moveUp(i)   { if (i > 0) swap(i, i - 1) }
  function moveDown(i) { if (i < items.length - 1) swap(i, i + 1) }
  function swap(a, b) {
    const next = [...items]; [next[a], next[b]] = [next[b], next[a]]
    onChange(next)
  }

  return (
    <div>
      <p className="rcd-hint">
        The order shown here is the order printed on the Recipe Card and Binder Page.
        Add a sub-group label (e.g. "CUPCAKES", "BUTTERCREAM") on any step to visually separate sections.
      </p>

      {items.length === 0 && (
        <p className="rcd-empty">No steps yet. Click <b>Add step</b> to begin.</p>
      )}

      <ol className="rcd-method-list">
        {items.map((it, i) => (
          <li key={i} className="rcd-method-row">
            <div className="rcd-method-num">{i + 1}</div>
            <div className="rcd-method-body">
              <input
                className="rcd-method-group-input"
                placeholder="Sub-group (optional, e.g. CUPCAKES)"
                value={it.group || ''}
                onChange={e => update(i, { group: e.target.value })}/>
              <textarea
                className="rcd-method-step-input"
                placeholder="Step description…"
                rows={2}
                value={it.step}
                onChange={e => update(i, { step: e.target.value })}/>
            </div>
            <div className="rcd-method-controls">
              <button className="ghost" onClick={() => moveUp(i)} title="Move up" disabled={i === 0}>↑</button>
              <button className="ghost" onClick={() => moveDown(i)} title="Move down" disabled={i === items.length - 1}>↓</button>
              <button className="ghost" onClick={() => removeAt(i)} title="Remove">×</button>
            </div>
          </li>
        ))}
      </ol>

      <div style={{ marginTop: 12 }}>
        <button className="primary" onClick={addStep}>+ Add step</button>
      </div>
    </div>
  )
}

/**
 * Save-time normaliser: trim whitespace, drop rows with no step AND no group,
 * strip empty `group` keys so the DB doesn't accumulate junk. Called from the
 * drawer's save() so mid-edit blanks stay visible while the user is typing.
 */
export function commitMethod(items) {
  if (!Array.isArray(items)) return []
  return items
    .map(it => ({ step: (it?.step || '').trim(), group: (it?.group || '').trim() }))
    .filter(it => it.step || it.group)
    .map(it => it.group ? it : { step: it.step })
}

// ============================================================================
// Marketing editor
// ============================================================================
function MarketingEditor({ value, onChange }) {
  return (
    <div>
      <p className="rcd-hint">
        Short marketing tagline (one sentence). Appears italic under the product name on the
        Social Media Card, and under the title on the Binder Page.
      </p>
      <textarea rows={3} value={value} onChange={e => onChange(e.target.value)}
        placeholder="e.g. Deeply moist. Dark chocolate ganache."/>
      <div className="rcd-hint">{value.length}/200 characters recommended.</div>
    </div>
  )
}

// ============================================================================
// Care & Storage editor
// ============================================================================
function CareEditor({ care, storage, allergens, defaults, onChange }) {
  return (
    <div>
      <p className="rcd-hint">
        Used on the Care &amp; Storage Card and the Delivery Tag. Leave blank to fall back to your
        <b> Template Customization → Recipe content defaults</b>.
      </p>

      <div className="field">
        <label>Care text</label>
        <textarea rows={2} value={care} onChange={e => onChange({ care_text: e.target.value })}
          placeholder={defaults.care || 'Best day of baking. Store in an airtight container up to 3 days.'}/>
      </div>

      <div className="field">
        <label>Storage notes</label>
        <textarea rows={2} value={storage} onChange={e => onChange({ storage_text: e.target.value })}
          placeholder={defaults.storage || 'Refrigerate in hot weather; back to room temp 30 min before serving.'}/>
      </div>

      <div className="field">
        <label>Allergens</label>
        <textarea rows={2} value={allergens} onChange={e => onChange({ allergens_text: e.target.value })}
          placeholder={defaults.allergens || 'Contains: wheat, dairy, eggs.'}/>
      </div>
    </div>
  )
}

// ============================================================================
// Product Label editor
// ============================================================================
function LabelEditor({ ingredients, allergens, defaults, onChange }) {
  return (
    <div>
      <p className="rcd-hint">
        Overrides for the Product Label. If <b>Label ingredients</b> is blank, the label will list
        ingredient names from Recipe BOM. If <b>Label allergens</b> is blank, it falls back to the
        recipe's Care &amp; Storage → Allergens, then to the brand default.
      </p>

      <div className="field">
        <label>Label ingredients (comma-separated, appears as a paragraph)</label>
        <textarea rows={3} value={ingredients} onChange={e => onChange({ label_ingredients_text: e.target.value })}
          placeholder="Dried blueberry, water, honey, caster sugar, salt, baking soda, wheat flour, instant yeast, brown sugar."/>
      </div>

      <div className="field">
        <label>Label allergen notice</label>
        <textarea rows={2} value={allergens} onChange={e => onChange({ label_allergens_text: e.target.value })}
          placeholder={defaults.allergens || 'Contains: wheat, dairy, eggs. May contain traces of nuts.'}/>
      </div>
    </div>
  )
}

// ============================================================================
// Menu Display editor
// ============================================================================
function MenuEditor({ value, onChange }) {
  return (
    <div>
      <p className="rcd-hint">
        Toggle whether this recipe appears on the printed Menu Insert and the Wholesale Price List.
        Turn off for internal-only recipes, seasonal items you don't currently sell, or test items.
      </p>
      <label className="rcd-toggle">
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}/>
        <span>Show this recipe on Menu Insert and Wholesale Price List</span>
      </label>
    </div>
  )
}
