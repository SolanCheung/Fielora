ALTER TABLE conversation_messages
ADD COLUMN references_json TEXT NOT NULL DEFAULT '[]'
CHECK (
    json_valid(references_json) AND
    json_type(references_json) = 'array' AND
    length(CAST(references_json AS BLOB)) BETWEEN 2 AND 1048576
);
