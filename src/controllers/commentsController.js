const { StatusCodes } = require('http-status-codes');
const { getPost } = require('../model/posts');
const { getComment, createComment, deleteComment, getPaginatedParentComments, getPaginatedChildComments } = require('../model/comments');
const fileService = require('../services/fileService');
const { createFile } = require('../model/files');
const { sanitizeId, isValidComment } = require('../services/sanitizationService');

const handleNewComment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { content, parentCommentId } = req.body;

        const postId = sanitizeId(req.params.id);

        if(!postId){
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid post id.' });
        }
    
        if(!content){
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Content is required.' });
        }
    
        if(!isValidComment(content)){
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid comment length.' });
        }

        const foundPost = await getPost({id: postId });
        if(!foundPost){
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid post id.' });
        }

        if(parentCommentId){
            const parentComment = await getComment({ id: parentCommentId });
            if(!parentComment){
                return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Parent comment not found.' });
            }
        }

        const newComment = await createComment({ postId, userId, content, parentCommentId });

        const files = req.files;
        const createdFiles = [];
        if(files)
        try {
            for(const key of Object.keys(files)){
                const fileField = files[key];
                const fileArray = Array.isArray(fileField) ? fileField : [fileField];

                for(const file of fileArray){
                    const filename = await fileService.saveFile(file);
                    createdFiles.push({ filename });
                    await createFile({ filename, comment_id: newComment.id});
                }

                newComment.files = createdFiles;
            }
        } catch (error){
            for(const file of createdFiles){
                await fileService.removeFile(file.filename);
            }
            await deleteComment({ id: newComment.id });
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error while saving attachments.' });
        }

        return res.status(StatusCodes.OK).json({ comment: newComment });
    } catch (error){
        console.error('newComment error: ', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal Server Error' });
    }
};

const handleGetParentComments = async (req, res) => {
    try {
        const postId = sanitizeId(req.params.id);
        const { limit = 10, lastFetchedTimestamp } = req.query;

        if(!postId){
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid post id.' });
        }

        const comments = await getPaginatedParentComments({
            postId,
            limit,
            lastFetchedTimestamp: lastFetchedTimestamp || null
        });
        
        const newLastFetchedTimestamp = comments.length > 0 
            ? comments[comments.length - 1].created_at 
            : lastFetchedTimestamp;

        return res.status(StatusCodes.OK).json({
            comments,
            pagination: {
                limit,
                lastFetchedTimestamp: newLastFetchedTimestamp,
                hasMore: comments.length === Number(limit)
            }
        });
    } catch (error){
        console.error('getParentComments: ', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal Server Error' });
    }
};

const handleGetChildComments = async (req, res) => {
    try {
        const parentId = sanitizeId(req.params.id);
        const { limit = 5, lastFetchedTimestamp } = req.query;

        if(!parentId){
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid parent comment id.' });
        }

        const replies = await getPaginatedChildComments({ 
            parentId,
            limit,
            lastFetchedTimestamp: lastFetchedTimestamp || null
        });

        const newLastFetchedTimestamp = replies.length > 0
            ? replies[replies.length - 1].created_at
            : lastFetchedTimestamp;

        return res.status(StatusCodes.OK).json({
            replies,
            pagination: {
                limit,
                lastFetchedTimestamp: newLastFetchedTimestamp,
                hasMore: replies.length === Number(limit)
            }
        });
    } catch(error){
        console.error('getChildComments: ', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    handleNewComment,
    handleGetParentComments,
    handleGetChildComments,
};
