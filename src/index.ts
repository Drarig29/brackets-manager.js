import { create } from './logic';
import { db } from './database';
import { Tournament } from 'brackets-model/dist/types';

const example: Tournament = {
    name: 'Example',
    minorOrdering: ['reverse', 'pair_flip', 'reverse', 'natural'],
    type: 'double_elimination',
    teams: [
        'Team 1', 'Team 2',
        'Team 3', 'Team 4',
        'Team 5', 'Team 6',
        'Team 7', 'Team 8',
        'Team 9', 'Team 10',
        'Team 11', 'Team 12',
        'Team 13', 'Team 14',
        'Team 15', 'Team 16',
    ],
};

db.reset();

create(example);