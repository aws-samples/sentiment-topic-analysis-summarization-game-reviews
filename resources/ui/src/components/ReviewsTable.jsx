import { useEffect } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Text,
    Flex,
    Heading,
    ScrollView,
    Loader
} from '@aws-amplify/ui-react';
import { useState } from 'react';
import { useGameContext } from "../contexts/GamesContext";


export default function ReviewsTable({ job }) {


    const [reviews, setReviews] = useState([])
    const [isLoading, setLoading] = useState(false)
    const { fetchReviews } = useGameContext()


    useEffect(() => {
        getReviews();
    }, []);

    const getReviews = async () => {
        setLoading(true)
        const gameId = job.PK.split('#')[1];
        const jobId = job.SK.split('#')[1];
        const reviews = await fetchReviews(gameId,jobId)
        setReviews(reviews)
        setLoading(false)
    };

    return (
        <>
        <Heading>Reviews {isLoading && <Loader />}</Heading>
        <Table>
            <TableHead>
                <TableRow>
                    <TableCell as="th">Number</TableCell>
                    <TableCell as="th">ID</TableCell>
                    <TableCell as="th">Review</TableCell>
                    <TableCell as="th">Overall Sentiment</TableCell>
                    <TableCell as="th">Classifications</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
            {reviews.map((review, index) => (
                <TableRow key={index}>
                    
                        <TableCell >{index + 1}</TableCell>
                        <TableCell >{review.SK}</TableCell>
                        <TableCell ><ScrollView maxWidth="100%" width="300px">{review.original_review}</ScrollView></TableCell>
                        <TableCell >{review.overall_sentiment}</TableCell>
                        <TableCell ><Flex direction="column">{review.classifications.map((classification, index) => (
                            
                            <Text key={index}>{classification.topic}: {classification.sentiment}</Text>
                           
                        ))} </Flex></TableCell>
                    
                </TableRow>
                ))}
            </TableBody>
        </Table>
        </>
    )
}