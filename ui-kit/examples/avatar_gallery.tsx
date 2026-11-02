import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ActivityAvatar, type AvatarQuality } from "../src/activity_avatar.js";
import { avatarDesigns, type AvatarDesign, type AvatarPose } from "../src/avatar_renderer.js";
function Gallery() {
    const [designs, setDesigns] = useState<readonly AvatarDesign[]>([]), [pose, setPose] = useState<AvatarPose>("listening"), [level, setLevel] = useState(.6), [animated, setAnimated] = useState(true), [error, setError] = useState(""), [shown, setShown] = useState(true);
    const [page, setPage] = useState(0);
    const [focused, setFocused] = useState(false), [quality, setQuality] = useState<AvatarQuality>("economy");
    const focusIds = ["watch-halo", "watch-wave", "watch-hover", "watch-rings", "watch-eye"];
    const shownDesigns = focused ? focusIds.flatMap(id => designs.filter(d => d.id === id)) : designs;
    const pageSize = 6, pages = Math.max(1, Math.ceil(shownDesigns.length / pageSize));
    useEffect(() => { avatarDesigns().then(setDesigns).catch(e => setError(String(e))); }, []);
    return <main><header><h1>AbstractAvatar gallery</h1><p>Explore the procedural designs and their seven activity states.</p></header>
 <section className="controls" aria-label="Preview controls"><label>Phase <select aria-label="Phase" value={pose} onChange={e => setPose(e.target.value as AvatarPose)}>{["ready", "listening", "thinking", "working", "speaking", "waiting", "error"].map(p => <option key={p}>{p}</option>)}</select></label><label>Audio level <input aria-label="Audio level" type="range" min="0" max="1" step=".01" value={level} onChange={e => setLevel(Number(e.target.value))}/></label><label>Quality <select aria-label="Quality" value={quality} onChange={e => setQuality(e.target.value as AvatarQuality)}>{["economy", "balanced", "high"].map(q => <option key={q}>{q}</option>)}</select></label><button onClick={() => { setFocused(v => !v); setPage(0); }}>{focused ? "All designs" : "Focus designs"}</button><button onClick={() => setAnimated(v => !v)}>{animated ? "Pause motion" : "Resume motion"}</button><button onClick={() => document.documentElement.classList.toggle("light")}>Light / dark</button><button onClick={() => setShown(v => !v)}>{shown ? "Hide avatars" : "Show avatars"}</button></section>
 <nav aria-label="Avatar pages"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous avatars</button><span>Page {page + 1} of {pages} · {shownDesigns.length} designs</span><button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next avatars</button></nav>
 {error && <p role="alert">{error}</p>}<section className="gallery">{shown && shownDesigns.slice(page * pageSize, (page + 1) * pageSize).map(d => <article key={d.id} data-design={d.id}><ActivityAvatar design={d.id} pose={pose} level={level} size={192} quality={quality} animated={animated} followCursor onError={e => setError(e.message)}/><h2>{d.name}</h2><p>{d.description}</p><small>{pose}{d.watchCode ? ` · reference ${d.watchCode}` : ""}</small></article>)}</section></main>;
}
createRoot(document.getElementById("app")!).render(<Gallery />);
