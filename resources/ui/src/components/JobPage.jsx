import { useState } from 'react'
import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Flex, Heading, Tabs, Text } from '@aws-amplify/ui-react'
import { useGameContext } from "../contexts/GamesContext";
import Chat from './Chat';
import ReviewsTable from './ReviewsTable';
import formatTimestamp from '../utils/formatTimestamp';


export default function JobPage() {
    const { gameId, jobId } = useParams()
    const { getGame, getJob } = useGameContext()
    const [job, setJob] = useState(null)
    const [game, setGame] = useState(null)

    useEffect(() => {
        const fetchGame = async () => {
            const fetchedGame = await getGame(gameId)
            setGame(fetchedGame)
        }
        const fetchJob = async () => {
            const fetchedJob = await getJob(gameId, jobId)
            console.log(fetchedJob)
            setJob(fetchedJob)
        }
        fetchGame()
        fetchJob()
    }, [])

    if (!game) return <></>

    if (!job) return <></>

    return (
        <Flex direction="column" justifyContent="flex-start">
            
            <Tabs
                justifyContent="flex-start"
                defaultValue='Tab 1'
                items={[
                    {
                        label: 'Job Details', value: 'Tab 1', content: <>
                            <Heading>Name: {job.jobName}</Heading>
                            <Text>Description: {job.jobDescription}</Text>
                            <Text>Status: {job.jobStatus}</Text>
                            <Text>Status Message: {job.jobMessage}</Text>
                            <Text>Submit Time: {formatTimestamp(job.submitTime)}</Text>
                            <Text>Last Modified Time: {formatTimestamp(job.lastModifiedTime)}</Text>
                        </>
                    },
                    { label: 'Chat', value: 'Tab 3', content: <Chat gameId={game.id} jobId={job.id} /> },

                    { label: 'Reviews', value: 'Tab 2', content: <ReviewsTable game={game} job={job} /> },
                ]}
            />
        </Flex>
    )
}