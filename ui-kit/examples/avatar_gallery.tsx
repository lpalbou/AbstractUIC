import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ActivityAvatar } from "../src/activity_avatar.js";
import { avatarDesigns, type AvatarDesign, type AvatarPose } from "../src/avatar_renderer.js";
function Gallery() {
    const [designs, setDesigns] = useState<readonly AvatarDesign[]>([]), [pose, setPose] = useState<AvatarPose>("listening"), [level, setLevel] = useState(.6), [animated, setAnimated] = useState(true), [error, setError] = useState(""), [shown, setShown] = useState(true);
    useEffect(() => { avatarDesigns().then(setDesigns).catch(e => setError(String(e))); }, []);
    return <main><header><h1>Shared activity avatars</h1><p>Watch-inspired artwork · one rendering core · no audio or inference</p></header>
 <section className="controls" aria-label="Preview controls"><label>Phase <select value={pose} onChange={e => setPose(e.target.value as AvatarPose)}>{["ready", "listening", "thinking", "working", "speaking", "waiting", "error"].map(p => <option key={p}>{p}</option>)}</select></label><label>Audio level <input aria-label="Audio level" type="range" min="0" max="1" step=".01" value={level} onChange={e => setLevel(Number(e.target.value))}/></label><button onClick={() => setAnimated(v => !v)}>{animated ? "Pause motion" : "Resume motion"}</button><button onClick={() => document.documentElement.classList.toggle("light")}>Light / dark</button><button onClick={() => setShown(v => !v)}>{shown ? "Hide avatars" : "Show avatars"}</button></section>
 {error && <p role="alert">{error}</p>}<section className="gallery">{shown && designs.map(d => <article key={d.id} data-design={d.id}><ActivityAvatar design={d.id} pose={pose} level={level} size={192} animated={animated} followCursor onError={e => setError(e.message)}/><h2>{d.name}</h2><p>{d.description}</p><small>{pose} · watch {d.watchCode}</small></article>)}</section></main>;
}
createRoot(document.getElementById("app")!).render(<Gallery />);
