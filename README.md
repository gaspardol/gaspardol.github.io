# gaspardol.github.io

Personal site of Gaspard Oliviers: https://gaspardol.github.io

Plain HTML/CSS/JS, no build step. Interactive explainers:

- `predictive-coding.html` + `assets/energy-machine.js`: predictive coding as an "energy machine" of springs
- `logic-gates.html` + `assets/dlgn.js`, `assets/logic-gates.js`: a differentiable logic gate network trained in the browser
- `analog.html` + `assets/circuit.js`: an analog circuit that performs predictive-coding inference by settling

## KPIs

`data/kpis.json` holds Google Scholar citations, GitHub stars (my repos + public repos I contributed to)
and total views of the Have you seen my quant Reels, with history for the charts.

- `.github/workflows/kpis.yml` refreshes stars and citations daily.
- `scripts/install_local_updater.sh` installs a daily macOS job that also adds the Instagram views
  from the local video pipeline's ledger and pushes the totals.
- Run by hand: `python3 scripts/update_kpis.py [--views-ledger PATH] [--backfill] [--push]`

Preview locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
