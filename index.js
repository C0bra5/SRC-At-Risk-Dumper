// ==UserScript==
// @name         SRC At Risk Run Dumper
// @namespace    https://github.com/C0bra5/SRC-At-Risk-Dumper
// @version      2025-03-07
// @description  Creates a CSV of all runs that are still hosted on twitch for a game you moderate on speedrun.com
// @author       C0bra5
// @match        https://www.speedrun.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=speedrun.com
// @grant        window.onurlchange
// ==/UserScript==

(async function() {
    'use strict';
    async function getAtRiskRuns(toReplace, status) {
        // resolve the game id
        const gameId = await fetch(
                '/api/v2/GetGameData?_r=' + btoa(JSON.stringify({
                    gameUrl: location.pathname.split('/')[1]
                })).replace(/\=+$/, ''),
                {
                    "method": "GET",
                    "headers": {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    "credentials": "include"
                }
            ).then(r => {
                if (r.status != 200) {
                    throw "failed to get game id";
                }
                return r.json();
            }).then(r => r.game.id);

        // get the at risk games
        const merged = {};
        let response = null
        let page = 1;
        do {
            // we can wait a bit, no need to hammer the api
            if (page > 1) {
                await sleep(1000);
            }
            const body = {
                gameId:gameId,
                verified:1,
                page:page,
                limit:100
            };
            if (status != void 0) {
                body.videoState = status;
            }
            response = await fetch(
                '/api/v2/GetModerationRuns',
                {
                    "method": "POST",
                    "body": JSON.stringify(body),
                    "headers": {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    "credentials": "include"
                }
            ).then(r => {
                if (r.status != 200) {
                    throw "failed to get at risk runs";
                }
                return r.json();
            });

            for (const [k,v] of Object.entries(response)) {
                if (k == 'pagination') continue;
                merged[k] ??= {};
                for (const item of v) {
                    merged[k][item.id] = item;
                }
            }
        } while (++page <= response.pagination.pages);

        // create csv output
        const headers = ['status','place','game','level','category','variables','run link','video link'];
        const stacker = [];
        const csv = [
            headers.join(','),
            ...Object.values(merged.runs).map(r => formatRunLine(r, merged, stacker))
        ].join('\n');

        // create the download button
        const a = document.createElement('a');
        a.innerText = "Click here to download at risk runs"
        a.href = 'data:text/csv,' + encodeURIComponent(csv);
        a.download = `${Object.values(merged.games)[0].url} - runs at risk.csv`;
        a.setAttribute('class', 'ml-1 x-input-button rounded text-sm px-2.5 py-1.5 bg-primary-600 text-on-primary-500 border border-white/5 hover:bg-primary-500 disabled:bg-primary-700');
        a.style.display = 'inline-flex'
        console.table(stacker, headers);
        toReplace.replaceWith(a);
        clearMeOnNav = a;
    }

    function sanitiseCSV(str) {
        str = str?.toString() ?? '';
        return str.indexOf('"') != -1 ? ('"' + str.replaceAll('"','""') + '"') : str
    }

    const VIDEO_STATES = ['Unknown', 'At Risk', 'Safe', 'Abandoned']
    function formatRunLine(run, merged, stacker) {
        const cols = [
            VIDEO_STATES[run.videoState] ?? '???',
            run.obsolete ? 'obsolete' : (run.place ?? '???'),
            merged.games[run.gameId].name,
            typeof(run.levelId) != 'string' ? '' : merged.levels[run.levelId].name,
            merged.categories[run.categoryId].name,
            typeof(run.valueIds) != 'object' ? '' : run.valueIds.map(v => merged.values[v].name).join(' '),
            `https://www.speedrun.com/${merged.games[run.gameId].url}/runs/${run.id}`,
            run.video
        ]
        let i = 0;
        stacker.push({
            'status': cols[i++],
            'place': cols[i++],
            'game': cols[i++],
            'level': cols[i++],
            'category': cols[i++],
            'variables': cols[i++],
            'run link': cols[i++],
            'video link': cols[i++]
        });
        return cols
            .map(sanitiseCSV)
            .join(',');
    }

    async function sleep(ms) {
        let res;
        const prom = new Promise((re,rj) => {res = re;});
        setTimeout(res, 1000);
        await prom;
    }

    let btnContainer;
    let clearMeOnNav;
    async function onLoad() {
        clearMeOnNav?.remove();
        btnContainer = null;

        // only activate on leaderboard pages.
        const pathParts = location.pathname.split('/');
        if (pathParts.length == 3 && !['level', 'leaderboards'].includes(pathParts[2])) {
            return;
        }
        if (pathParts.length == 2 && ['supporter','games','streams','news','forums','about','support','pages','forums','terms-of-use','modhub','users','messages','settings','',null].includes(pathParts[1])) {
            return;
        }
        if (![2,3].includes(pathParts.length)) {
            return;
        }

        // fetch the target container
        let attempted = false;
        while (btnContainer == null) {
            if (attempted) {
                await sleep(1000);
            }
            btnContainer = document.querySelector(`main#app-main .font-title a[href="/${location.pathname.split('/')[1]}"]`)?.parentElement;
            attempted = true;
        }

        // add the dump button
        const btn = document.createElement('button');
        btn.setAttribute('class', 'ml-1 x-input-button rounded text-sm px-2.5 py-1.5 bg-primary-600 text-on-primary-500 border border-white/5 hover:bg-primary-500 disabled:bg-primary-700');
        btn.style.display = 'inline-flex'
        btn.addEventListener('click', async (ev) => {
            ev.target.disabled = true;
            ev.target.innerText = 'Working...'
            try {
                await getAtRiskRuns(ev.target, ev.ctrlKey ? void 0 : 1);
            }
            catch (err) {
                console.error(err);
                const a = document.createElement('a');
                a.innerText = "Failed! Are you logged in?"
                a.disabled = true;
                a.setAttribute('class', 'ml-1 x-input-button rounded text-sm px-2.5 py-1.5 bg-red-600 text-on-red-500 border border-white/5 hover:bg-red-500 disabled:bg-red-700');
                a.style.display = 'inline-flex';
                ev.target.replaceWith(a);
                clearMeOnNav = a;
            }
        }, {once: true});

        btn.innerText = "load at risk runs";
        btn.type = 'button';
        clearMeOnNav = btn;
        btnContainer.append(btn);
    }
    if (window.onurlchange === null) {
        // feature is supported
        window.addEventListener('urlchange', () => { console.log('urlchanged'); onLoad()});
    }

    onLoad();
})();
