import { TournamentData } from "brackets-model/dist/types";
import * as fs from 'fs';

const viewerRoot = 'https://cdn.jsdelivr.net/gh/Drarig29/brackets-viewer.js/dist';

export function makeViewer(data: TournamentData) {
    const html = `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.slim.min.js"></script>

<link rel="stylesheet" href="${viewerRoot}/brackets-viewer.min.css" />
<script type="text/javascript" src="${viewerRoot}/brackets-viewer.min.js"></script>

<section class="tournament"></section>
<script>
    bracketsViewer.render(${JSON.stringify(data, null, 4)});
</script>`;

    fs.writeFileSync('viewer/viewer.html', html);
}