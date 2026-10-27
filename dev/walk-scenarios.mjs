// 歩く見かた（一人称の 3D）の画面の試験。browser.mjs から呼ばれる。
// 本物の index.js と world3d.js を、偽のポインターロックと偽の本体で動かし、本物のキーとマウスを送る。

export function walkScenarios(c) {
  const { cdp, boot, cf, ev, sleep, shot, check, count, chestByName, names, invSlot, CTRL } = c;
  const WP = { mode: "walk", view: "caption", seen: true };
  const W3 = (expr) => cf(`(() => { const r = cf.room; return ${expr}; })()`);
  const J = JSON.stringify;
  const enter = async () => { await cdp.click(640, 400); await sleep(250); };
  const hold = async (code, sec) => { await cdp.down(code); await W3(`(r.advance(${sec}), 0)`); await cdp.up(code); };
  /** 空いている台座。奥から */
  const freePad = () => cf(`(() => { const used = new Set(cf.world.room.map((r) => r.x + "," + r.y)); for (let y = 7; y >= 0; y--) for (let x = 0; x < 8; x++) if (!used.has(x + "," + y)) return { x, y }; })()`);
  /** 台座の南の通路から、台座を見下ろす */
  const aimPad = (cx, cy) => W3(`(() => { const p = r.player; p.x = 56 + 1 + 2 * ${cx} + 0.5; p.z = 44 + 1 + 2 * ${cy} + 1.5; p.y = 9; p.vx = p.vz = p.vy = 0; p.yaw = 0; p.pitch = -1.0; r.advance(0.1); return 0; })()`);
  const face = (cid) => W3(`(r.faceChest(${J(cid)}), r.advance(0.2), 0)`);

  return {
    /** はじめの画面・ポーズ・固定・歩く・ジャンプ・見回す */
    async walkBasic() {
      await boot({ walk: true, prefs: WP });
      await W3(`(r.buildAll(), 0)`);
      check(await W3(`r.kind === "walk"`), "はじめは、歩く見かた");
      check(await ev(`!document.querySelector(".w3d-pause").hidden`), "はじめは、クリックを待つ画面が出る");
      check(!(await W3(`r.locked`)), "まだポインターは固定していない");
      check(await ev(`document.getElementById("room").hidden && !document.getElementById("world").hidden`), "俯瞰の canvas は隠れ、3D の canvas が出ている");
      await shot("walk-1-pause");
      await enter();
      check(await W3(`r.locked`) && await ev(`document.querySelector(".w3d-pause").hidden`), "クリックで、ポインターを固定して、ワールドに入る");
      check(await ev(`document.getElementById("app").classList.contains("locked") && getComputedStyle(document.querySelector(".topbar")).opacity === "0"`), "固定しているあいだは、上の帯を隠す");
      check(await ev(`getComputedStyle(document.querySelector(".w3d-cross")).display === "block"`), "十字の照準が出る");
      await sleep(500);
      await shot("walk-hall");

      const s0 = await W3(`r.state()`);
      await hold("KeyW", 1);
      const s1 = await W3(`r.state()`);
      check(s0.z - s1.z > 3.5 && Math.abs(s1.x - s0.x) < 0.1, `W で、前（北）へ歩く ${(s0.z - s1.z).toFixed(1)} ブロック`);
      await hold("KeyD", 0.5);
      const s2 = await W3(`r.state()`);
      check(s2.x - s1.x > 1.5, "D で、右（東）へ");
      await hold("KeyA", 0.5);
      check((await W3(`r.state().x`)) < s2.x - 1.5, "A で、左へ");
      await hold("KeyS", 0.4);
      check((await W3(`r.state().z`)) > s1.z + 1, "S で、後ろへ");
      await cdp.down("Space");
      await W3(`(r.advance(0.25), 0)`);
      const high = await W3(`r.state().y`);
      await cdp.up("Space");
      await W3(`(r.advance(1), 0)`);
      check(high > s2.y + 0.5 && (await W3(`r.state().onGround`)), "Space でジャンプして、また床に降りる");
      // 走る
      const z0 = await W3(`r.state().z`);
      await cdp.down("ControlLeft");
      await cdp.down("KeyW");
      await W3(`(r.advance(1), 0)`);
      await cdp.up("KeyW");
      await cdp.up("ControlLeft");
      check(z0 - (await W3(`r.state().z`)) > 4.5, "Ctrl を押しながらで、走る");
      // 見回す
      const yaw0 = await W3(`r.state().yaw`);
      await W3(`(r.look(100, 0), 0)`);
      check((await W3(`r.state().yaw`)) < yaw0 - 0.1, "マウスを右へ動かすと、右を向く");
      await W3(`(r.look(0, -300), 0)`);
      check((await W3(`r.state().pitch`)) > 0.5, "上へ動かすと、上を向く");
      await W3(`(r.look(0, 9999), 0)`);
      check((await W3(`r.state().pitch`)) >= -1.56, "真下より先へは向かない");
      // 実際のマウスの動き（movementX）も効く
      await W3(`(r.look(0, 0), r.player.yaw = 0, r.player.pitch = 0, 0)`);
      await cdp.mouse("mouseMoved", 600, 380, { buttons: 0 });
      await cdp.mouse("mouseMoved", 700, 380, { buttons: 0 });
      await sleep(250);
      console.log("  実際のマウスで動いた向き", (await W3(`r.state().yaw`)).toFixed(3));
      // ポーズ：固定が外れたら、待つ画面
      await ev(`document.exitPointerLock()`);
      await sleep(250);
      check(!(await W3(`r.locked`)) && await ev(`!document.querySelector(".w3d-pause").hidden`), "固定が外れると（Esc）、クリックを待つ画面に戻る");
      check(await ev(`getComputedStyle(document.querySelector(".topbar")).opacity === "1"`), "上の帯がまた出て、ボタンを押せる");
      await cdp.down("KeyW");
      const zp = await W3(`r.state().z`);
      await W3(`(r.advance(0.5), 0)`);
      await cdp.up("KeyW");
      await enter();
      check(await W3(`r.locked`), "クリックで、また入れる");
    },

    /** 狙う・開く・持ち上げて置く・重ねる・置く・ぶつかる・飛ぶ */
    async walkUse() {
      await boot({ walk: true, prefs: WP });
      await W3(`(r.buildAll(), 0)`);
      await enter();
      const work = await chestByName("しごと");
      await face(work);
      let st = await W3(`r.state()`);
      check(st.aim && st.aim.type === "chest" && st.aim.cid === work, "チェストのほうを向くと、狙いが合う");
      check(await ev(`document.querySelector(".w3d-hint .l1").textContent.includes("しごと") && document.querySelector(".w3d-hint .l2").textContent.includes("右クリック")`), "狙ったチェストの名前と、操作のヒントが出る");
      await shot("walk-2-aim");

      // 右クリックで開く
      await cdp.mouse("mouseMoved", 640, 380, { buttons: 0 });   // 実マウスの移動で向きが動くので、先に動かしておく
      await sleep(200);
      const cam0 = await W3(`r.state()`);
      await cdp.rightClick(640, 380);
      await sleep(400);
      check(await cf(`cf.guiOpen && cf.stack[0] === ${J(work)}`), "右クリックで、チェストが開く");
      const cam1 = await W3(`r.state()`);
      check(cam1.shift === 0 && cam1.x === cam0.x && cam1.z === cam0.z && cam1.yaw === cam0.yaw && cam1.pitch === cam0.pitch, "開いても、カメラ（見え方）は動かない");
      const pbox = await ev(`(() => { const r = document.querySelector(".panel").getBoundingClientRect(); return { cx: r.left + r.width / 2, backdrop: !document.querySelector(".backdrop").hidden }; })()`);
      check(Math.abs(pbox.cx - 640) < 3 && pbox.backdrop, "チェストの画面は、画面の中央に重なり、うしろのワールドは少し暗くなる");
      check(!(await W3(`r.control`)) && !(await W3(`r.locked`)), "チェストの画面のあいだは、歩けない。ポインターは戻る");
      check(await ev(`document.querySelector(".w3d-pause").hidden`), "このとき、待つ画面は出ない");
      await sleep(500);
      await shot("walk-3-chest");
      const z1 = await W3(`r.state().z`);
      await hold("KeyW", 1);
      check(Math.abs((await W3(`r.state().z`)) - z1) < 0.01, "チェストの画面を開いているあいだは、Wを押しても歩かない");

      // 見えているチェストに、ファイルを直接落とす
      const later = await chestByName("あとで見る");
      const lp = await W3(`r.chestScreen(${J(later)})`);
      const rect = await ev(`(() => { const r = document.getElementById("world").getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
      const tgt = lp && { x: lp.x + rect.x, y: lp.y + rect.y };
      const hidden = !tgt || await ev(`!!document.elementFromPoint(${tgt.x}, ${tgt.y})?.closest(".panel") || ${tgt.x} < 0 || ${tgt.x} > innerWidth`);
      if (!hidden) {
        const f = await invSlot("名刺データ.csv");
        await cdp.drag(f.x, f.y, tgt.x, tgt.y);
        await sleep(300);
        check((await names(later)).includes("名刺データ.csv"), "ワールドに見えているチェストへ、ファイルを直接落とせる");
      } else console.log("  見えているチェストが画面の枠のうしろ。この確かめは飛ばした");

      // Esc で閉じる
      await cdp.key("Escape");
      await sleep(300);
      check(!(await cf(`cf.guiOpen`)) && await W3(`r.control && r.locked`), "Esc で閉じると、また歩ける。ポインターも固定する");

      // チェストの上を左クリックでクリックして、チェストの画面を閉じるのは、チェストの画面があるとき
      await face(work);
      await cdp.rightClick(640, 380);
      await sleep(300);
      const sc = await W3(`r.chestScreen(${J(await chestByName("しゃしん"))})`);
      void sc;
      // 持ち上げ → 台座に置く
      await cdp.key("Escape");
      await sleep(200);
      await face(work);
      await cdp.click(640, 380);
      await sleep(200);
      check(await W3(`r.held`) === work, "左クリックで、チェストを持ち上げる");
      check(await ev(`!document.querySelector(".w3d-held").hidden && document.querySelector(".w3d-held b").textContent === "しごと"`), "持っているチェストが、画面の右下に出る");
      const pad = await freePad();
      await aimPad(pad.x, pad.y);
      st = await W3(`r.state()`);
      check(st.aim && st.aim.type === "pad" && st.aim.free && st.aim.cx === pad.x && st.aim.cy === pad.y, `空いた台座を狙える ${JSON.stringify(st.aim)}`);
      await sleep(300);
      await shot("walk-4-holding");
      await cdp.rightClick(640, 380);
      await sleep(300);
      check(await cf(`JSON.stringify(cf.world.room.find((r) => r.cid === ${J(work)}))`) === JSON.stringify({ cid: work, x: pad.x, y: pad.y }), "右クリックで、持ち上げたチェストを、狙った台座に置く");
      check(!(await W3(`r.held`)), "置いたら、手は空になる");
      // 持ち上げて、元に戻す
      await face(work);
      await cdp.click(640, 380);
      await sleep(150);
      await cdp.click(640, 380);
      await sleep(150);
      check(!(await W3(`r.held`)) && await cf(`JSON.stringify(cf.world.room.find((r) => r.cid === ${J(work)}))`) === JSON.stringify({ cid: work, x: pad.x, y: pad.y }), "持ち上げて、もう一度左クリックで、元に戻る");
      await face(work);
      await cdp.click(640, 380);
      await sleep(100);
      await cdp.key("q");
      await sleep(100);
      check(!(await W3(`r.held`)), "Q でも、元に戻せる");

      // 別のチェストに重ねて入れる
      const photo = await chestByName("しゃしん");
      const secret = await chestByName("秘密");
      await face(photo);
      await cdp.click(640, 380);
      await sleep(200);
      check(await W3(`r.held`) === photo, "もう1つ持ち上げる");
      await face(secret);
      await cdp.rightClick(640, 380);
      await sleep(300);
      check(await cf(`cf.world.parentOf(${J(photo)}).cid === ${J(secret)}`), "持ち上げたチェストを、別のチェストに右クリックすると、その中へ入る");
      await cdp.key("z", { mods: CTRL });
      await sleep(250);
      check(await cf(`cf.world.room.some((r) => r.cid === ${J(photo)})`), "元に戻せる");

      // 空いた台座に右クリックで、新しいチェストを置く
      const n0 = await cf(`cf.world.chestCount`);
      const pad2 = await freePad();
      await aimPad(pad2.x, pad2.y);
      await cdp.rightClick(640, 380);
      await sleep(500);
      check(await cf(`cf.world.chestCount`) === n0 + 1 && await cf(`cf.world.room.some((r) => r.x === ${pad2.x} && r.y === ${pad2.y})`), "空いた台座に右クリックで、新しいチェストを置く");
      check(await ev(`document.activeElement === document.querySelector(".c-name")`), "置いたら開いて、名前の欄に入る");
      await cdp.type("ぼくの");
      await cdp.key("Enter");
      await sleep(200);
      check(await cf(`cf.world.chest(cf.stack[0]).name`) === "ぼくの", "続けて名前を入れられる");
      await cdp.key("Escape");
      await sleep(300);
      check(!(await cf(`cf.guiOpen`)), "Esc で閉じる");

      // チェストにはぶつかる
      const oak = await chestByName("資料");
      const pos = await cf(`(() => { const r = cf.world.room.find((x) => x.cid === ${J(oak)}); return { x: 56 + 1 + 2 * r.x, z: 44 + 1 + 2 * r.y }; })()`);
      await W3(`(() => { const p = r.player; p.x = ${pos.x} + 0.5; p.z = ${pos.z} + 2.5; p.y = 9; p.vx = p.vz = p.vy = 0; p.yaw = 0; p.pitch = 0; return 0; })()`);
      await hold("KeyW", 2);
      check((await W3(`r.state().z`)) > pos.z + 1.2, "チェストにぶつかって、通りぬけられない");

      // 飛ぶ
      await W3(`(() => { const p = r.player; p.x = 64.5; p.z = 58.5; p.y = 9; p.vx = p.vz = p.vy = 0; return 0; })()`);
      await cdp.key(" ", { code: "Space" });
      await cdp.key(" ", { code: "Space" });
      await sleep(100);
      check(await W3(`r.state().flying`), "Space を2回で、飛ぶ");
    },

    /** 外・空・夜・検索・ホットバー・見かたの切りかえ・固定できないとき */
    async walkWorld() {
      await boot({ walk: true, prefs: WP });
      await W3(`(r.buildAll(), 0)`);
      await enter();
      // 外へ出る
      await W3(`(() => { const p = r.player; p.yaw = Math.PI; p.pitch = 0.1; return 0; })()`);
      await hold("KeyW", 4.2);
      const sz = await W3(`r.state().z`);
      check(sz > 44 + 17 + 3, `入口を通って、外の草原へ出られる z=${sz.toFixed(1)}`);
      await W3(`(r.buildAll(), r.advance(0.2), 0)`);
      await sleep(500);
      await shot("walk-5-outside");
      await W3(`(() => { r.player.yaw = 0.5; r.player.pitch = 0.45; return 0; })()`);
      await sleep(500);
      await shot("walk-6-sky");
      // 夜
      await cf(`(window.explorerPlus.__theme("dark"), 0)`);
      await sleep(2800);
      await W3(`(() => { r.player.yaw = 0.5; r.player.pitch = 0.4; return 0; })()`);
      await sleep(300);
      await shot("walk-7-night-sky");
      await W3(`(() => { r.player.yaw = Math.PI; r.player.pitch = 0.05; return 0; })()`);
      await sleep(300);
      await shot("walk-8-night-outside");
      // 中へもどる
      await W3(`(r.resetView(), r.advance(0.2), 0)`);
      await sleep(300);
      await shot("walk-9-night-hall");
      await cf(`(window.explorerPlus.__theme("light"), 0)`);
      await sleep(2500);

      // 検索：見つけたチェストの前へ行き、開く
      await cdp.key("/");
      await sleep(200);
      check(await ev(`document.activeElement === document.querySelector(".search input")`) && !(await W3(`r.locked`)), "/ で検索の欄に入る。ポインターは戻る");
      await cdp.type("決算");
      await sleep(250);
      const ps0 = await W3(`r.state()`);
      await cdp.key("Enter");
      await sleep(600);
      const path = await cf(`cf.stack.map((id) => cf.world.chest(id).name).join(">")`);
      check(path === "しごと>2019年", `見つけたものを選ぶと、そのチェストが開く ${path}`);
      const pp = await W3(`r.state()`);
      check(Math.abs(pp.x - ps0.x) < 1e-6 && Math.abs(pp.z - ps0.z) < 1e-6 && Math.abs(pp.yaw - ps0.yaw) < 1e-6 && Math.abs(pp.pitch - ps0.pitch) < 1e-6, "検索で見つけても、歩く人もカメラも動かさない");
      await cdp.key("Escape");
      await sleep(200);
      await cdp.key("Escape");
      await sleep(300);

      // ホットバーの数字
      await cdp.key("2");
      await sleep(500);
      check(await cf(`cf.guiOpen && cf.world.chest(cf.stack[0]).name === "しごと"`), "数字キーで、ホットバーのチェストが開く");
      await cdp.key("Escape");
      await sleep(300);

      // 見かたの切りかえ
      await cdp.key("v");
      await sleep(500);
      check(await cf(`cf.room.kind === "iso" && cf.prefs.mode === "iso"`) && await ev(`!document.getElementById("room").hidden && document.getElementById("world").hidden`), "V で、俯瞰に切りかわる");
      check(!(await cf(`cf.walk.locked`)), "切りかえると、ポインターを戻す");
      await shot("walk-10-iso");
      await cdp.key("v");
      await sleep(500);
      check(await cf(`cf.room.kind === "walk"`), "もう一度 V で、歩くに戻る");
      await cf(`cf.store.flush()`);
      await sleep(200);
      check(await ev(`window.explorerPlus.__store.get("prefs").mode === "walk"`), "見かたは、覚えられる");

      // 固定できない環境
      await boot({ walk: true, nolock: true, prefs: WP });
      await W3(`(r.buildAll(), 0)`);
      await cdp.click(640, 400);
      await sleep(300);
      check(await W3(`r.lockFailed`) && await ev(`document.querySelector(".w3d-pause").hidden`), "ポインターを固定できなくても、遊べる");
      const y0 = await W3(`r.state().yaw`);
      await cdp.down("ArrowLeft");
      await W3(`(r.advance(0.5), 0)`);
      await cdp.up("ArrowLeft");
      check((await W3(`r.state().yaw`)) > y0 + 0.5, "矢印キーで、見回せる");
    },

    /** 俯瞰から歩くへ。GUI の中の操作は、歩くでも同じ */
    async walkSystem() {
      await boot({ walk: true, prefs: WP });
      await W3(`(r.buildAll(), 0)`);
      await enter();
      // チェストの画面を、歩くで開いたまま、いつもの操作
      const photo = await chestByName("しゃしん");
      await face(photo);
      await cdp.rightClick(640, 380);
      await sleep(400);
      const a = await invSlot("ロゴ案.png");
      const chestSlotPos = await ev(`(() => { const el = document.querySelector('.chest-grid .slot[data-i="7"]'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await cdp.drag(a.x, a.y, chestSlotPos.x, chestSlotPos.y);
      await sleep(300);
      check((await names(photo))[7] === "ロゴ案.png", "歩くでも、持ち物からスロットへドラッグして入れられる");
      await cdp.key("z", { mods: CTRL });
      await sleep(200);
      check((await names(photo))[7] == null, "元に戻せる");
      // チェストの画面を開いたまま、別のチェストが、画面の左のほうに見えるように、向きを変える
      const secret = await chestByName("秘密");
      const showAt = async (cid) => {
        const base = await W3(`r.state().yaw`);
        await W3(`(r.player.pitch = -0.3, 0)`);
        for (let k = -80; k <= 80; k++) {
          await W3(`(r.player.yaw = ${base} + ${k} * 0.04, 0)`);
          const p = await W3(`r.chestScreen(${J(cid)})`);
          if (p && ((p.x > 60 && p.x < 320) || (p.x > 960 && p.x < 1220)) && p.y > 120 && p.y < 520) {
            const hit = await W3(`r.pointAt(${p.x}, ${p.y} + document.getElementById("world").getBoundingClientRect().top)`);
            if (hit.cid === cid) return p;
          }
        }
        return null;
      };
      const sp = await showAt(secret);
      check(!!sp, "チェストの画面のとなりに、ほかのチェストが見えるように向けられる");
      const rect = await ev(`(() => { const r = document.getElementById("world").getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
      const sx = sp.x + rect.x, sy = sp.y + rect.y;
      // 見えているチェストへ、ファイルを直接ドロップ
      const fl = await invSlot("名刺データ.csv");
      await cdp.drag(fl.x, fl.y, sx, sy);
      await sleep(300);
      check((await names(secret)).includes("名刺データ.csv"), "ワールドに見えているチェストへ、ファイルを直接ドロップできる");
      // チェストの絵のスロットを、ワールドの床の台座へドロップ：部屋に出る
      const pads = await cf(`(() => { const used = new Set(cf.world.room.map((r) => r.x + "," + r.y)); return [0, 1, 2, 3, 4, 5, 6, 7].flatMap((x) => [0, 1, 2, 3, 4, 5, 6, 7].map((y) => ({ x, y }))).filter((p) => !used.has(p.x + "," + p.y)); })()`);
      void pads;
      // 見えているチェストをクリックすると、そのチェストの画面に切りかわる
      await cdp.click(sx, sy);
      await sleep(400);
      check(await cf(`cf.stack[0] === ${J(secret)}`), "チェストの画面を開いたまま、見えているほかのチェストをクリックすると、そちらが開く");
      // 何も無い所をクリックすると、閉じる
      const spots = [[30, 650], [30, 300], [1250, 300], [1250, 650]];
      let spot = spots[0];
      for (const [x, y] of spots) { const h = await W3(`r.pointAt(${x}, ${y}).cid`); if (!h) { spot = [x, y]; break; } }
      await cdp.click(spot[0], spot[1]);
      await sleep(400);
      check(!(await cf(`cf.guiOpen`)) && await W3(`r.control`), "ワールドの何も無い所をクリックすると、チェストの画面が閉じる");

      // E：持ち物だけ。もう一度 E で閉じて、また歩ける
      await cdp.key("e");
      await sleep(300);
      check(await cf(`cf.guiOpen && cf.stack.length === 0`) && !(await W3(`r.control`)), "E で、持ち物だけを開く");
      await cdp.key("e");
      await sleep(300);
      check(!(await cf(`cf.guiOpen`)) && await W3(`r.control && r.locked`), "もう一度 E で閉じて、また歩ける");

      // R：はじまりの場所へ
      await W3(`(() => { r.player.x = 10; r.player.z = 10; r.player.y = 12; return 0; })()`);
      await cdp.key("r");
      await sleep(200);
      check(Math.abs((await W3(`r.state().x`)) - 64.5) < 0.1, "R で、はじまりの場所へ戻る");
      // 上の帯の「チェストを置く」（ポインターを戻したあと）
      await cdp.key("Escape");
      await ev(`document.exitPointerLock()`);
      await sleep(250);
      const n0 = await cf(`cf.world.chestCount`);
      await cdp.click(...Object.values(await c.center('[data-act="new"]')).slice(0, 2));
      await sleep(500);
      check(await cf(`cf.world.chestCount`) === n0 + 1, "上の帯の「チェストを置く」で、いちばん近い空きの台座に置かれる");
      await shot("walk-11-new");
    },

    /** F：狙ったチェストのメニュー */
    async walkMenu() {
      await boot({ walk: true, menu: "kind", choose: "ender", prefs: WP });
      await W3(`(r.buildAll(), 0)`);
      await enter();
      const work = await chestByName("しごと");
      await face(work);
      await cdp.key("f");
      await sleep(500);
      check(await cf(`cf.world.chest(${J(work)}).kind`) === "ender", "F で、狙ったチェストのメニューが出て、種類を変えられる");
      check(await ev(`window.__menuSeen.extra.includes("rename") && window.__menuSeen.extra.includes("destroy")`), "メニューには、名前・種類・こわすが並ぶ");
      // 何も狙っていないときは、何も起きない
      await W3(`(() => { r.player.pitch = 1.2; r.advance(0.1); return 0; })()`);
      await ev(`window.__menuSeen = null`);
      await cdp.key("f");
      await sleep(300);
      check(await ev(`window.__menuSeen === null`), "何も狙っていないときの F は、何も起こさない");
    },
  };
}
