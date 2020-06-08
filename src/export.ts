// import { Teams, TournamentData, TournamentResults, BracketScores, RoundScores, MatchScores } from 'brackets-model/dist/types';
// import { db } from './database';

// export function exportToViewer(stageId: number): TournamentData {
//     const stage = db.select('stage', stageId);
//     const groups = db.select('group', group => group.stage_id === stageId);
//     const rounds = db.select('round', round => db.isIn(round.group_id, groups));
//     const matches = db.select('match', match => db.isIn(match.round_id, rounds));

//     const winnerBracket = groups.filter(group => group.name === 'Winner Bracket')[0];
//     const firstRound = rounds.filter(round => round.group_id === winnerBracket.id && round.number === 1)[0];
//     const knownMatches = matches.filter(match => match.round_id === firstRound.id);

//     const teams: Teams = [];

//     knownMatches.map(match => {
//         teams.push(match.opponent1.name);
//         teams.push(match.opponent2.name);
//     });

//     const results: TournamentResults = [];

//     for (const group of groups) {
//         const groupScores: BracketScores = [];

//         for (const round of rounds.filter(r => r.group_id === group.id)) {
//             const roundScores: RoundScores = [];

//             for (const match of matches.filter(m => m.round_id === round.id)) {
//                 const matchScores: MatchScores = [
//                     // TODO: change those hardcoded values!
//                     match.opponent1 ? match.opponent1.score || 1 : 1,
//                     match.opponent2 ? match.opponent2.score || 0 : 0,
//                 ];
//                 roundScores.push(matchScores);
//             }
//             groupScores.push(roundScores);
//         }
//         results.push(groupScores);
//     }

//     return {
//         name: stage.name,
//         type: stage.type,
//         teams,
//         results
//     };
// }