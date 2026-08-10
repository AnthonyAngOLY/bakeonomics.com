import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { Icon } from '../lib/icons.jsx'
import UserAvatarMenu from './UserAvatarMenu.jsx'

// How many matches to show per section (recipes / ingredients) in the dropdown
const PER_SECTION = 6

/**
 * Case-insensitive prefix-and-substring match. Recipe / ingredient names are
 * short, so a linear scan over ~50 rows per user is fine — no need for a fuzzy
 * library. Substring wins over nothing; a name that STARTS with the query
 * scores higher so "cho" surfaces "Chocolate Fudge Cake" above "Rich Choc
 * Brownie".
 */
function score(name, q) {
  const n = (name || '').toLowerCase()
  const query = q.toLowerCase().trim()
  if (!query) return 0
  const idx = n.indexOf(query)
  if (idx === -1) return 0
  return idx === 0 ? 2 : 1  // prefix > substring > no match
}

export default function Topbar() {
  const { user } = useAuth() || {}
  const navigate = useNavigate()

  const [links, setLinks] = useState([])
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])

  // Search state
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const searchRef = useRef(null)
  const inputRef = useRef(null)

  // ---- data loads ---------------------------------------------------------
  useEffect(() => {
    if (!user?.id) return
    let alive = true
    ;(async () => {
      const [linksRes, recipesRes, ingredientsRes] = await Promise.all([
        supabase.from('header_links').select('*').order('position'),
        supabase.from('recipes').select('id, name, category').order('name'),
        supabase.from('ingredients').select('id, name').order('name'),
      ])
      if (!alive) return
      setLinks(linksRes.data || [])
      setRecipes(recipesRes.data || [])
      setIngredients(ingredientsRes.data || [])
    })()
    return () => { alive = false }
  }, [user?.id])

  // Defensive dedupe: same icon+label appears only once, even if DB has stale duplicates.
  const uniqueLinks = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const link of links) {
      const key = `${link.icon_name || ''}::${(link.label || '').toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(link)
    }
    return out
  }, [links])

  // ---- filtering ---------------------------------------------------------
  const results = useMemo(() => {
    const query = q.trim()
    if (!query) return { recipes: [], ingredients: [], flat: [] }

    const rankAndTake = (rows) =>
      rows
        .map(r => ({ ...r, _s: score(r.name, query) }))
        .filter(r => r._s > 0)
        .sort((a, b) => b._s - a._s || a.name.localeCompare(b.name))
        .slice(0, PER_SECTION)

    const rMatches = rankAndTake(recipes).map(r => ({ ...r, _kind: 'recipe' }))
    const iMatches = rankAndTake(ingredients).map(r => ({ ...r, _kind: 'ingredient' }))
    // Flat list drives keyboard navigation — recipes listed first, then ingredients
    const flat = [...rMatches, ...iMatches]
    return { recipes: rMatches, ingredients: iMatches, flat }
  }, [q, recipes, ingredients])

  // Reset cursor when the result set changes
  useEffect(() => { setCursor(0) }, [q])

  // ---- click-outside close ------------------------------------------------
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // ---- navigation --------------------------------------------------------
  function goToHit(hit) {
    if (!hit) return
    const path = hit._kind === 'recipe' ? '/app/recipes' : '/app/ingredients'
    navigate(`${path}?highlight=${hit.id}`)
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
  }

  function onKeyDown(e) {
    if (e.key === 'Escape')      { setOpen(false); inputRef.current?.blur() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.flat.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); goToHit(results.flat[cursor]) }
  }

  function openDrawer() {
    window.dispatchEvent(new CustomEvent('mobile-nav-open'))
  }

  const showDropdown = open && q.trim().length > 0

  return (
    <div className="topbar">
      <button className="hamburger" onClick={openDrawer} aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="4" y1="7"  x2="20" y2="7"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <line x1="4" y1="17" x2="20" y2="17"/>
        </svg>
      </button>

      <div className="search" ref={searchRef}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search recipes, ingredients…"
          aria-label="Search recipes and ingredients"
          aria-expanded={showDropdown}
          aria-controls="topbar-search-results"
          autoComplete="off"
        />

        {showDropdown && (
          <div className="search-dropdown" id="topbar-search-results" role="listbox">
            {results.flat.length === 0 ? (
              <div className="search-empty">No matches for &ldquo;{q}&rdquo;</div>
            ) : (
              <>
                {results.recipes.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-label">Recipes</div>
                    {results.recipes.map((r, i) => (
                      <SearchRow
                        key={`r-${r.id}`}
                        hit={r}
                        active={cursor === i}
                        onHover={() => setCursor(i)}
                        onClick={() => goToHit(r)}
                      />
                    ))}
                  </div>
                )}
                {results.ingredients.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-label">Ingredients</div>
                    {results.ingredients.map((r, i) => {
                      const flatIdx = results.recipes.length + i
                      return (
                        <SearchRow
                          key={`i-${r.id}`}
                          hit={r}
                          active={cursor === flatIdx}
                          onHover={() => setCursor(flatIdx)}
                          onClick={() => goToHit(r)}
                        />
                      )
                    })}
                  </div>
                )}
                <div className="search-hint">↑↓ navigate &nbsp;·&nbsp; ↵ open &nbsp;·&nbsp; esc close</div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="top-icons">
        {uniqueLinks.map(link => (
          link.url ? (
            <a key={link.id} className="icn-btn" href={link.url}
               target={link.open_in_new_tab ? '_blank' : '_self'}
               rel={link.open_in_new_tab ? 'noopener noreferrer' : undefined}
               title={link.label}>
              <Icon name={link.icon_name || 'link'} size={18}/>
            </a>
          ) : (
            <div key={link.id} className="icn-btn" title={link.label}>
              <Icon name={link.icon_name || 'link'} size={18}/>
            </div>
          )
        ))}
        <div className="icn-btn" title="Notifications">
          <Icon name="bell" size={18}/>
          <span className="dot"/>
        </div>
        <UserAvatarMenu size={34}/>
      </div>
    </div>
  )
}

function SearchRow({ hit, active, onHover, onClick }) {
  const kindLabel = hit._kind === 'recipe' ? (hit.category || 'Recipe') : 'Ingredient'
  return (
    <button
      type="button"
      className={`search-row${active ? ' active' : ''}`}
      onMouseEnter={onHover}
      onMouseDown={(e) => e.preventDefault()}  /* prevent blur before click */
      onClick={onClick}
      role="option"
      aria-selected={active}
    >
      <Icon name={hit._kind === 'recipe' ? 'recipes' : 'ingredients'} size={14}/>
      <span className="search-row-name">{hit.name}</span>
      <span className="search-row-kind">{kindLabel}</span>
    </button>
  )
}
