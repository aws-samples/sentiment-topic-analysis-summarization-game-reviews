import Uploader from "./Uploader";
import { useParams } from "react-router-dom"
import { useGameContext } from '../contexts/GamesContext';
import { useEffect, useState } from 'react'
import { Heading, Message, View } from "@aws-amplify/ui-react";


export default function UploadForm() {
    const { gameId, jobId } = useParams()
    const { getGame } = useGameContext()
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        const fetchGame = async () => {
            try {
                setLoading(true);
                const fetchedGame = await getGame(gameId);
                setGame(fetchedGame);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchGame();
    }, [gameId, getGame]);

    return (
        <div>
            {game && (
                <View>
                    <Heading level={4}>Upload Reviews for {game.title}</Heading>
                    <Message variation="outlined" colorTheme="warning" >
                        Please upload a CSV file with the following column headers: <strong>id, review</strong>
                    </Message>

                    <Uploader gameId={gameId} jobId={jobId} />
                </View>
            )}

        </div>
    )
}