-- The default pipeline. Ids are fixed so later migrations can refer to them.
INSERT INTO stages (id, name, position, outcome) VALUES
  ('stage-lead',     'Lead',     0, NULL),
  ('stage-talking',  'Talking',  1, NULL),
  ('stage-proposal', 'Proposal', 2, NULL),
  ('stage-won',      'Won',      3, 'won'),
  ('stage-lost',     'Lost',     4, 'lost');
