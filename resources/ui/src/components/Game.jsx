import { useContext, useState } from 'react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useParams } from "react-router-dom"
import { Button, Flex, Heading, View, Tabs, Text, Card, Message, Input, Divider, Collection, Table, TableCell, TableRow, TableBody, TableHead } from "@aws-amplify/ui-react"
import JobItem from './JobItem';
import ReviewsTable from './ReviewsTable';
import Chat from './Chat';
import { useGameContext } from '../contexts/GamesContext';

export default function Game() {

    const { id } = useParams();
    const navigate = useNavigate();
    const { getGame, fetchGamesByUserId, updateGame, addGame, deleteGame } = useGameContext();
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [title, setTitle] = useState('');
    const [isUpdating, setIsUpdating] = useState(false)


    useEffect(() => {
        const fetchGame = async () => {
            try {
                setLoading(true);
                const fetchedGame = await getGame(id);
                setGame(fetchedGame);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchGame();
    }, [id, getGame]);

    const addGameHandler = async () => {
        if (!title.trim()) {
            setError("Title cannot be empty");
            return;
        }
        try {
            const response = await addGame({ title });
            setTitle('');
            navigate(`/games/${response.id}`);
        } catch (err) {
            setError(err.message);
        }
    };

    const updateGameHandler = async () => {
        if (!title.trim()) {
            setError("Title cannot be empty");
            return;
        }
        try {
            await updateGame(id, { title });
            await fetchGamesByUserId()
            setIsUpdating(false)
            setTitle('')
        } catch (err) {
            setError(err.message);
        }
    };

    const editGameHandler = () => {
        setIsUpdating(true)
        setTitle(game.title)
    }

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this game?')) {
            try {
                await deleteGame(id);
                navigate('/games');
            } catch (err) {
                setError(err.message);
            }
        }
    };

    const createJobHandler = async () => {
        navigate(`/games/${id}/jobs/new`)
    }

    if (loading) return <p>Loading game...</p>;
    if (error) return <p>Error: {error}</p>;


    return (
        <Flex direction="column">
            <Flex direction="row" alignItems="center" marginTop="medium">
                <Flex direction="column">
                    {error && (
                        <Message variation="error">{error}</Message>
                    )}

                    <Flex direction="row">
                        <Input
                            flex="1"
                            placeholder="Title"
                            hasError={error !== null || !title.trim()}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                        {isUpdating ? (
                            <Button onClick={updateGameHandler} variation="primary" isDisabled={!title.trim()}>Save</Button>
                        ) : (
                            <Button onClick={addGameHandler} variation="primary" isDisabled={!title.trim()}>Add Game</Button>
                        )}
                    </Flex>
                </Flex>

            </Flex>
            <Divider />
            {game && (
                <>

                    <Flex>
                        <Heading level="3">{game.title}</Heading>

                        <Button onClick={editGameHandler}>
                            {/* <IconEdit /> */}
                            Edit
                        </Button>
                        <Button variation='warning' onClick={handleDelete}>
                            {/* <IconDelete /> */}
                            Delete
                        </Button>
                    </Flex>
                    <Card>
                        <Flex direction="column">
                            <Heading level="4">Jobs <Button  onClick={createJobHandler}>Create Job</Button></Heading>
                            <Table highlightOnHover>
                                <TableHead>
                                    <TableRow>
                                        <TableCell as='th'>Job Name</TableCell>
                                        <TableCell as='th'>Last Modified Time</TableCell>
                                        <TableCell as='th'>Status</TableCell>
                                        <TableCell as='th'>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {game.jobs && game.jobs.map((job, jobIndex) => (
                                        <JobItem job={job} game={game} key={jobIndex} />
                                    ))}
                                </TableBody>
                            </Table>


                        </Flex>

                    </Card>
                </>
            )}
        </Flex>
    )
}