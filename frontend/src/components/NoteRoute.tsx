import { useParams, useNavigate } from "react-router-dom";
import NoteView from "./NoteView";

export default function NoteRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();

  if (!noteId) return null;
  return (
    <NoteView
      noteId={noteId}
      onBack={() => navigate("/")}
    />
  );
}
