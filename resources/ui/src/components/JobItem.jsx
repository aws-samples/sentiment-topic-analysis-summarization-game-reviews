import React, { useEffect } from "react";
import Uploader from "./Uploader";
import { useState } from "react";
import { Button, Flex, Text, Table, TableHead, TableRow, TableBody, TableCell, ToggleButton, TextAreaField, Heading, Menu, MenuItem, Loader } from "@aws-amplify/ui-react";
import { useNavigate, useParams } from "react-router-dom";
import { useGameContext } from "../contexts/GamesContext";
import formatTimestamp from "../utils/formatTimestamp";


export default function JobItem({ job, isShowUploadPressed, setIsShowUploadPressed }) {

    // console.log("The job State is",jobState)

    const { id } = useParams()
    const navigate = useNavigate()
    const { deleteJob, fetchJob, fetchGames, fetchGamesByUserId, getGame, submitJob } = useGameContext()
    const [game, setGame] = useState({})
    const [jobState, setJob] = useState(job)
    const [isLoading, setIsLoading] = useState(false)


    const [error, setError] = useState(null)

    const fetchGame = async () => {
        const fetchedGame = await getGame(id);
        setGame(fetchedGame);
    }

    useEffect(() => {
        try {
            fetchGame(id)
        } catch (err) {
            setError(err.message)
        }
    }, [])

    const updateJob = async () => { 
        console.log("update job")
        setIsLoading(true)
        await fetchJob(id, job.id)
        setIsLoading(false)
    }

    const handleUploadReviews = () => {
        navigate('/games/' + game.id + '/jobs/' + job.id + '/upload-reviews')
    }

    const deleteJobHandler = async () => {
        try {
            setIsLoading(true)
            await deleteJob(game.id, job.id)
            fetchGamesByUserId()
        } catch (err) {
            setIsLoading(false)
            setError(err.message)
        }
    }

    const submitJobHandler = () => {
        setIsLoading(true)
        submitJob(id, job.id, job.rawreviewsfilename)
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Failed to start review analysis');
                }
                return response.json();
            })
            .then((data) => {
                setIsLoading(false)
                const newJob = fetchJob(id, job.id)
                setJob(newJob)
                
            })
            .catch((err) => {
                setIsLoading(false)
                setError(err.message);
            } )
    };

    const navigateToJobPage = () => {
        navigate('/games/' + game.id + '/jobs/' + job.id)
    }

    return (

        <TableRow >
            <TableCell>{jobState.jobName} </TableCell>
            <TableCell>{formatTimestamp(job.lastModifiedTime)}</TableCell>
            <TableCell>{job.jobStatus} </TableCell>
            <TableCell>
            {isLoading && <Loader />}
                <Menu size="small">
                    <MenuItem onClick={navigateToJobPage}>Details</MenuItem>
                    <MenuItem onClick={updateJob}>Update Status</MenuItem>
                    <MenuItem isDisabled={job.rawreviewsfilename !== ""} onClick={handleUploadReviews}>Upload Reviews</MenuItem>
                    <MenuItem isDisabled={job.jobStatus !== "Not Submitted"} variation='link' onClick={submitJobHandler}>Submit Job</MenuItem>
                    <MenuItem variation='warning' onClick={deleteJobHandler}>Delete </MenuItem>
                </Menu>
            </TableCell>
        </TableRow>

    )
}